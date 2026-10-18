from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import webbrowser
from contextlib import contextmanager
from datetime import timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, request, send_file, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

# PyInstaller's --onedir build places bundled resources under _MEIPASS; user data must live
# outside that folder so updates/restarts do not erase accounts and saves.
BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
STATIC_DIR = BASE_DIR / "static"
_desktop_secret = None
if getattr(sys, "frozen", False):
    # Stable storage for installed builds. Keep it outside the bundled resource folder.
    _app_data = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "SolsRNGDarkFantasy"
    _app_data.mkdir(parents=True, exist_ok=True)
    _default_db = _app_data / "solsrng.sqlite3"
    if not os.environ.get("SECRET_KEY"):
        _secret_path = _app_data / "secret.key"
        try:
            _desktop_secret = _secret_path.read_text(encoding="utf-8").strip()
        except OSError:
            _desktop_secret = ""
        if len(_desktop_secret or "") < 32:
            _desktop_secret = secrets.token_urlsafe(64)
            _secret_path.write_text(_desktop_secret, encoding="utf-8")
else:
    _default_db = BASE_DIR / "data" / "solsrng.sqlite3"
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(_default_db)))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
# A generated persistent secret is used only by the installed local app. Public deployments
# must supply their own private SECRET_KEY through the hosting provider.
_is_production = os.environ.get("APP_ENV", "development").lower() == "production"
_secret_key = os.environ.get("SECRET_KEY") or _desktop_secret
if _is_production and (not _secret_key or len(_secret_key) < 32):
    raise RuntimeError("Em produção, defina SECRET_KEY com pelo menos 32 caracteres aleatórios.")
app.config.update(
    SECRET_KEY=_secret_key or secrets.token_urlsafe(48),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0").lower() in {"1", "true", "yes"},
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)
# Respect HTTPS headers when deployed behind a reverse proxy.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins=None, logger=False, engineio_logger=False)

ROOMS: dict[str, dict] = {}
SOCKET_USERS: dict[str, dict] = {}
ROOM_LOCK = threading.RLock()
ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
VALID_CLASSES = {
    "campones", "guerreiro", "mago", "ladino", "paladino", "arqueiro", "medica"
}
CLASS_PROFILES = {
    "campones": {"hp": 100, "mp": 30, "attack": 10, "magic": 7, "role": "Aventureiro"},
    "guerreiro": {"hp": 150, "mp": 20, "attack": 15, "magic": 4, "role": "Linha de frente"},
    "mago": {"hp": 80, "mp": 90, "attack": 7, "magic": 17, "role": "Mago"},
    "ladino": {"hp": 90, "mp": 40, "attack": 13, "magic": 7, "role": "Dano crítico"},
    "paladino": {"hp": 130, "mp": 60, "attack": 11, "magic": 10, "role": "Proteção"},
    "arqueiro": {"hp": 100, "mp": 35, "attack": 13, "magic": 8, "role": "Dano à distância"},
    "medica": {"hp": 90, "mp": 80, "attack": 7, "magic": 12, "role": "Suporte"},
}
RUN_MATERIALS = ["Trigo", "Pedra", "Ferro", "Cristal lunar", "Escama sombria"]
RUN_ENEMIES = [
    {"name": "Lodo Ácido", "hp": 34, "attack": 7, "gold": 12, "drop": "Pedra"},
    {"name": "Goblin das Ruínas", "hp": 42, "attack": 8, "gold": 18, "drop": "Ferro"},
    {"name": "Lobo Sombrio", "hp": 52, "attack": 10, "gold": 25, "drop": "Escama sombria"},
    {"name": "Guardião Espectral", "hp": 66, "attack": 12, "gold": 34, "drop": "Cristal lunar"},
]
RUN_BOSSES = [
    {"name": "Sentinela do Véu", "hp": 140, "attack": 15, "gold": 100, "drop": "Cristal lunar", "boss": True},
    {"name": "Cavaleiro Sem Rosto", "hp": 180, "attack": 18, "gold": 160, "drop": "Escama sombria", "boss": True},
]


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def db_session():
    conn = db_connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with db_session() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS player_saves (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                save_data TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS friend_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(sender_id, receiver_id),
                CHECK(sender_id <> receiver_id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_friend_receiver_status ON friend_requests(receiver_id, status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_friend_sender_status ON friend_requests(sender_id, status)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS room_invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_code TEXT NOT NULL,
                sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(room_code, sender_id, receiver_id),
                CHECK(sender_id <> receiver_id)
            )
        """)
        conn.commit()


init_db()


def public_user(row: sqlite3.Row | dict) -> dict:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def current_user_id() -> str | None:
    return session.get("uid")


def get_current_user() -> dict | None:
    uid = current_user_id()
    if not uid:
        return None
    with db_session() as conn:
        row = conn.execute("SELECT id, username, email FROM users WHERE id = ?", (uid,)).fetchone()
    return public_user(row) if row else None


def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not current_user_id() or get_current_user() is None:
            return jsonify(error="Entre na sua conta para continuar."), 401
        return fn(*args, **kwargs)
    return wrapped


def json_body() -> dict:
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def clean_username(value: str) -> str:
    value = re.sub(r"\s+", " ", str(value or "")).strip()
    return value[:24]


def validate_email(value: str) -> str:
    email = str(value or "").strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Digite um e-mail válido.")
    return email


def json_error(message: str, status: int):
    return jsonify(error=message), status


@app.get("/")
def home():
    # A raiz serve diretamente o jogo; não mostra listagem de diretórios.
    return send_file(STATIC_DIR / "game.html", mimetype="text/html")


@app.get("/healthz")
def healthz():
    return jsonify(status="ok", game="Sols RNG Dark Fantasy")


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = clean_username(body.get("username"))
    try:
        email = validate_email(body.get("email"))
    except ValueError as exc:
        return json_error(str(exc), 400)
    password = str(body.get("password") or "")
    if len(username) < 2:
        return json_error("Escolha um nome de jogador com pelo menos 2 caracteres.", 400)
    if len(password) < 8:
        return json_error("A senha precisa ter pelo menos 8 caracteres.", 400)
    if len(password) > 200:
        return json_error("A senha é longa demais.", 400)

    user_id = secrets.token_hex(16)
    password_hash = generate_password_hash(password, method="scrypt")
    try:
        with db_session() as conn:
            conn.execute(
                "INSERT INTO users(id, username, email, password_hash) VALUES (?, ?, ?, ?)",
                (user_id, username, email, password_hash),
            )
            conn.execute(
                "INSERT INTO player_saves(user_id, save_data) VALUES (?, ?)",
                (user_id, json.dumps({"version": 5, "save": None, "meta": None})),
            )
            conn.commit()
    except sqlite3.IntegrityError:
        with db_session() as conn:
            email_exists = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        if email_exists:
            return json_error("Esse e-mail já tem uma conta. Entre nela ou use outro e-mail.", 409)
        return json_error("Esse nome de jogador já está em uso. Escolha outro.", 409)

    session.clear()
    session["uid"] = user_id
    session.permanent = True
    with db_session() as conn:
        row = conn.execute("SELECT id, username, email FROM users WHERE id = ?", (user_id,)).fetchone()
    return jsonify(user=public_user(row), message="Conta criada! Você já está conectado."), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not email or not password:
        return json_error("Informe seu e-mail e sua senha.", 400)
    with db_session() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return json_error("E-mail ou senha incorretos.", 401)
    session.clear()
    session["uid"] = row["id"]
    session.permanent = True
    return jsonify(user=public_user(row), message="Login realizado.")


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    user = get_current_user()
    return jsonify(user=user), (200 if user else 200)


@app.get("/api/save")
@login_required
def get_save():
    uid = current_user_id()
    with db_session() as conn:
        row = conn.execute("SELECT save_data, updated_at FROM player_saves WHERE user_id = ?", (uid,)).fetchone()
    if not row:
        return jsonify(save_data={"version": 5, "save": None, "meta": None}, updated_at=None)
    try:
        data = json.loads(row["save_data"])
    except (TypeError, json.JSONDecodeError):
        data = {"version": 5, "save": None, "meta": None}
    return jsonify(save_data=data, updated_at=row["updated_at"])


@app.put("/api/save")
@login_required
def put_save():
    body = json_body()
    save_value = body.get("save")
    meta_value = body.get("meta")
    if save_value is not None and not isinstance(save_value, str):
        return json_error("Dados de save inválidos.", 400)
    if meta_value is not None and not isinstance(meta_value, str):
        return json_error("Dados de progresso inválidos.", 400)
    if len(save_value or "") > 1_000_000 or len(meta_value or "") > 250_000:
        return json_error("O save está maior do que o permitido.", 413)
    payload = json.dumps({"version": 5, "save": save_value, "meta": meta_value}, ensure_ascii=False)
    with db_session() as conn:
        conn.execute("""
            INSERT INTO player_saves(user_id, save_data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET save_data=excluded.save_data, updated_at=CURRENT_TIMESTAMP
        """, (current_user_id(), payload))
        conn.commit()
    return jsonify(ok=True)


def make_player(uid: str, raw: dict | None = None) -> dict:
    """Build presence from server-owned class baselines; client stats are display hints only."""
    raw = raw if isinstance(raw, dict) else {}
    with db_session() as conn:
        row = conn.execute("SELECT username FROM users WHERE id = ?", (uid,)).fetchone()
    username = row["username"] if row else "Aventureiro"
    cls = str(raw.get("classId") or "campones")
    if cls not in VALID_CLASSES:
        cls = "campones"
    profile = CLASS_PROFILES[cls]
    return {
        "userId": uid, "name": username, "classId": cls,
        "hp": profile["hp"], "maxHp": profile["hp"],
        "mp": profile["mp"], "maxMp": profile["mp"],
        "dmg": profile["attack"], "stage": 1, "role": profile["role"],
    }


def socket_user() -> dict | None:
    uid = session.get("uid")
    if not uid:
        return None
    with db_session() as conn:
        row = conn.execute("SELECT id, username, email FROM users WHERE id = ?", (uid,)).fetchone()
    return public_user(row) if row else None


def emit_roster(code: str) -> None:
    room = ROOMS.get(code)
    if not room:
        return
    players = []
    for p in room["players"].values():
        players.append({k: v for k, v in p.items() if k != "sid"})
    socketio.emit("room_roster", {"code": code, "hostId": room["hostId"], "players": players, "run": room.get("run"), "battle": room.get("battle")}, to=code)


def remove_socket_from_room(sid: str) -> None:
    info = SOCKET_USERS.get(sid)
    if not info:
        return
    code = info.get("room")
    if not code:
        return
    with ROOM_LOCK:
        room = ROOMS.get(code)
        if room:
            player = room["players"].get(info["id"])
            if player and player.get("sid") == sid:
                room["players"].pop(info["id"], None)
            run = room.get("run")
            if run and info["id"] in run.get("party", {}):
                run["party"].pop(info["id"], None)
                order = run.get("turnOrder", [])
                old_index = run.get("turnIndex", 0)
                run["turnOrder"] = [member for member in order if member != info["id"]]
                if run["turnOrder"]:
                    run["turnIndex"] = old_index % len(run["turnOrder"])
                else:
                    run["turnIndex"] = 0
                if len(run.get("party", {})) == 0:
                    room["run"] = None
                    room["runMeta"] = {"threat": 0, "resolved": 0}
            if not room["players"]:
                ROOMS.pop(code, None)
            else:
                if room["hostId"] not in room["players"]:
                    room["hostId"] = next(iter(room["players"]))
                emit_roster(code)
    try:
        leave_room(code, sid=sid)
    except Exception:
        pass
    info["room"] = None


def add_player_to_room(code: str, uid: str, sid: str, raw: dict | None = None, create: bool = False) -> dict:
    user = socket_user()
    if not user:
        return {"ok": False, "error": "Entre na sua conta antes de jogar online."}
    raw = raw if isinstance(raw, dict) else {}
    with ROOM_LOCK:
        if create:
            for _ in range(20):
                candidate = "".join(secrets.choice(ROOM_ALPHABET) for _ in range(6))
                if candidate not in ROOMS:
                    code = candidate
                    break
            else:
                return {"ok": False, "error": "Não foi possível criar uma sala. Tente novamente."}
            ROOMS[code] = {"hostId": uid, "players": {}, "run": None, "battle": None}
        room = ROOMS.get(code)
        if not room:
            return {"ok": False, "error": "Essa sala não existe mais. Peça um convite novo."}
        existing = room["players"].get(uid)
        if not existing and len(room["players"]) >= 3:
            return {"ok": False, "error": "A sala está cheia (máximo de 3 jogadores)."}

    remove_socket_from_room(sid)
    player = make_player(uid, raw)
    player.update({"name": user["username"], "sid": sid})
    with ROOM_LOCK:
        room = ROOMS.get(code)
        if not room:
            return {"ok": False, "error": "A sala fechou. Crie outra sala."}
        room["players"][uid] = player
        SOCKET_USERS[sid]["room"] = code
        if not room.get("hostId") or room["hostId"] not in room["players"]:
            room["hostId"] = uid
        # New arrivals join an active party at an exploration checkpoint, never mid-enemy turn.
        run = room.get("run")
        if run and run.get("phase") == "exploration" and uid not in run.get("party", {}):
            profile = CLASS_PROFILES[player["classId"]]
            run.setdefault("party", {})[uid] = {
                "id": uid, "name": user["username"], "classId": player["classId"],
                "hp": profile["hp"], "maxHp": profile["hp"], "mp": profile["mp"], "maxMp": profile["mp"],
                "attack": profile["attack"], "magic": profile["magic"], "guard": False,
                "gold": 0, "materials": {}, "alive": True,
            }
            run.setdefault("turnOrder", []).append(uid)
        join_room(code, sid=sid)
        visible = [{k: v for k, v in p.items() if k != "sid"} for p in room["players"].values()]
        result = {"ok": True, "code": code, "hostId": room["hostId"], "players": visible, "run": room.get("run"), "battle": room.get("battle")}
        emit_roster(code)
    return result


@socketio.on("connect")
def on_connect(auth=None):
    user = socket_user()
    if not user:
        return False
    SOCKET_USERS[request.sid] = {**user, "room": None}
    emit("server_ready", {"user": user})


@socketio.on("room_create")
def on_room_create(data=None):
    info = SOCKET_USERS.get(request.sid)
    user = socket_user()
    if not info or not user:
        return {"ok": False, "error": "Entre na sua conta primeiro."}
    body = data if isinstance(data, dict) else {}
    return add_player_to_room("", user["id"], request.sid, body.get("player"), create=True)


@socketio.on("room_join")
def on_room_join(data=None):
    info = SOCKET_USERS.get(request.sid)
    user = socket_user()
    if not info or not user:
        return {"ok": False, "error": "Entre na sua conta primeiro."}
    body = data if isinstance(data, dict) else {}
    code = re.sub(r"[^A-Z0-9]", "", str(body.get("code") or "").upper())
    if not re.fullmatch(r"[A-Z0-9]{6}", code):
        return {"ok": False, "error": "O código da sala precisa ter 6 caracteres."}
    return add_player_to_room(code, user["id"], request.sid, body.get("player"), create=False)


@socketio.on("player_update")
def on_player_update(data=None):
    info = SOCKET_USERS.get(request.sid)
    if not info or not info.get("room"):
        return
    code = info["room"]
    with ROOM_LOCK:
        room = ROOMS.get(code)
        player = room and room["players"].get(info["id"])
        if not player or player.get("sid") != request.sid:
            return
        fresh = make_player(info["id"], data if isinstance(data, dict) else {})
        fresh.update({"name": info["username"], "sid": request.sid})
        room["players"][info["id"]] = fresh
        emit_roster(code)


def make_shared_run(room: dict, difficulty: str = "medium") -> dict:
    party = {}
    order = []
    for uid, present in room.get("players", {}).items():
        profile = CLASS_PROFILES.get(present.get("classId"), CLASS_PROFILES["campones"])
        party[uid] = {
            "id": uid, "name": str(present.get("name") or "Aventureiro")[:24],
            "classId": present.get("classId", "campones"),
            "hp": profile["hp"], "maxHp": profile["hp"],
            "mp": profile["mp"], "maxMp": profile["mp"],
            "attack": profile["attack"], "magic": profile["magic"], "guard": False,
            "gold": 0, "materials": {}, "alive": True,
        }
        order.append(uid)
    return {
        "runId": secrets.token_hex(3).upper(), "stage": 1, "step": 0,
        "phase": "exploration", "difficulty": difficulty if difficulty in {"easy", "medium", "hard"} else "medium",
        "members": order[:], "party": party, "turnOrder": order, "turnIndex": 0,
        "enemy": None, "log": "A expedição começa. O vento traz vozes das ruínas.",
        "resolved": 0,
    }


def _alive_ids(run: dict) -> list[str]:
    return [uid for uid in run.get("turnOrder", []) if run.get("party", {}).get(uid, {}).get("alive") and run["party"][uid].get("hp", 0) > 0]


def _current_turn(run: dict) -> str | None:
    alive = _alive_ids(run)
    if not alive:
        return None
    order = run.get("turnOrder", [])
    if not order:
        return None
    idx = run.get("turnIndex", 0) % len(order)
    # Skip down/departed members without leaving the turn stuck.
    for offset in range(len(order)):
        uid = order[(idx + offset) % len(order)]
        if uid in alive:
            run["turnIndex"] = (idx + offset) % len(order)
            return uid
    return None


def apply_shared_action(room: dict, uid: str, action: str) -> tuple[bool, str]:
    run = room.get("run")
    if not run:
        return False, "Inicie uma expedição em equipe antes de agir."
    if run.get("phase") in {"complete", "failed"}:
        return False, "Esta expedição terminou. O anfitrião pode iniciar outra."
    if uid not in run.get("party", {}):
        return False, "Você ainda não faz parte desta expedição."
    current = _current_turn(run)
    if current != uid:
        current_player = run.get("party", {}).get(current, {})
        return False, f"Aguarde o turno de {current_player.get('name', 'outro aventureiro')}."
    actor = run["party"][uid]
    phase = run.get("phase")
    living_turn_order = _alive_ids(run)
    living_turn_index = living_turn_order.index(uid) if uid in living_turn_order else 0
    end_of_round = bool(living_turn_order) and living_turn_index >= len(living_turn_order) - 1
    difficulty_multiplier = {"easy": 0.8, "medium": 1.0, "hard": 1.25}.get(run.get("difficulty"), 1.0)
    log = ""

    if phase == "exploration":
        if action == "explore":
            run["step"] += 1
            meta = room.setdefault("runMeta", {"threat": 0, "resolved": 0})
            chance = min(74, 26 + run["stage"] * 5 + meta.get("threat", 0) * 8)
            if secrets.randbelow(100) < chance:
                resolved = int(meta.get("resolved", 0))
                boss_chance = min(38, max(0, (resolved - 1) * 10))
                if resolved >= 2 and secrets.randbelow(100) < boss_chance:
                    base = RUN_BOSSES[min(run["stage"] - 1, len(RUN_BOSSES) - 1)].copy()
                    base["hp"] = int(base["hp"] * difficulty_multiplier * (1 + (run["stage"] - 1) * 0.3))
                    base["attack"] = int(base["attack"] * difficulty_multiplier)
                    base["name"] = ["Sentinela do Véu", "Cavaleiro Sem Rosto", "Arauto do Abismo"][run["stage"] - 1]
                    if run["stage"] == 3:
                        base["hp"] = int(base["hp"] * 1.25)
                    run["enemy"] = {**base, "maxHp": base["hp"]}
                    run["phase"] = "encounter"
                    meta["threat"] = 0
                    log = "As pedras estremecem. Um mensageiro grita: ‘Para trás! Algo enorme está vindo!’"
                else:
                    base = RUN_ENEMIES[secrets.randbelow(len(RUN_ENEMIES))].copy()
                    base["hp"] = int(base["hp"] * difficulty_multiplier * (1 + (run["stage"] - 1) * 0.23))
                    base["attack"] = int(base["attack"] * difficulty_multiplier)
                    run["enemy"] = {**base, "maxHp": base["hp"]}
                    run["phase"] = "encounter"
                    meta["threat"] = 0
                    log = f"Rastros cruzam a trilha. {base['name']} salta das ruínas!"
            else:
                meta["threat"] = min(6, meta.get("threat", 0) + 1)
                rumors = [
                    "Uma mensageira aponta para o horizonte: ‘As aves fugiram da torre.’",
                    "Você encontra um acampamento abandonado e cinzas ainda mornas.",
                    "O sino toca uma vez, embora a torre esteja vazia.",
                    "Pegadas enormes desaparecem sob uma ponte antiga.",
                    "Uma luz tremula atrás das muralhas. O caminho continua aberto.",
                ]
                log = rumors[secrets.randbelow(len(rumors))]
        elif action == "gather":
            if sum(actor.get("materials", {}).values()) >= 12:
                return False, "Sua bolsa de expedição está cheia (12 materiais)."
            material = RUN_MATERIALS[secrets.randbelow(len(RUN_MATERIALS))]
            actor.setdefault("materials", {})[material] = actor.setdefault("materials", {}).get(material, 0) + 1
            log = f"{actor['name']} encontrou {material.lower()} e guardou o material na bolsa de equipe pessoal."
            if secrets.randbelow(100) < 12:
                actor["gold"] += 8 + run["stage"] * 3
                log += f" Também encontrou {8 + run['stage'] * 3} moedas."
        elif action == "rest":
            healed = min(actor["maxHp"] - actor["hp"], 20 + run["stage"] * 3)
            restored = min(actor["maxMp"] - actor["mp"], 10 + run["stage"] * 2)
            actor["hp"] += healed
            actor["mp"] += restored
            log = f"{actor['name']} descansa perto das tochas: +{healed} HP e +{restored} MP."
        else:
            return False, "Na exploração, escolha explorar, coletar materiais ou descansar."
    elif phase == "encounter":
        enemy = run.get("enemy")
        if not enemy:
            run["phase"] = "exploration"
            return False, "O encontro acabou; a trilha está livre."
        if action == "attack":
            damage = actor["attack"] + secrets.randbelow(max(3, actor["attack"] // 2 + 1))
            enemy["hp"] = max(0, enemy["hp"] - damage)
            log = f"{actor['name']} atinge {enemy['name']} e causa {damage} de dano."
        elif action == "magic":
            cost = 12
            if actor["mp"] < cost:
                return False, "Mana insuficiente. Escolha atacar, defender ou curar."
            actor["mp"] -= cost
            damage = actor["magic"] * 2 + secrets.randbelow(max(3, actor["magic"] // 2 + 1))
            enemy["hp"] = max(0, enemy["hp"] - damage)
            log = f"{actor['name']} lança magia e causa {damage} de dano."
        elif action == "defend":
            actor["guard"] = True
            log = f"{actor['name']} assume uma postura defensiva para o próximo ataque."
        elif action == "heal":
            cost = 10 if actor["classId"] != "medica" else 7
            if actor["mp"] < cost:
                return False, "Mana insuficiente para curar."
            allies = [member for member in run["party"].values() if member.get("alive") and member["hp"] > 0]
            target = min(allies, key=lambda member: member["hp"] / max(1, member["maxHp"])) if allies else actor
            if target["hp"] >= target["maxHp"]:
                return False, "Todos estão com a vida cheia."
            actor["mp"] -= cost
            healed = min(target["maxHp"] - target["hp"], actor["magic"] * (3 if actor["classId"] == "medica" else 2) + 8)
            target["hp"] += healed
            log = f"{actor['name']} cura {target['name']} em {healed} HP."
        elif action == "explore":
            return False, "Derrotem ou enfrentem a criatura antes de avançar."
        else:
            return False, "Durante o encontro, escolha atacar, magia, defender ou curar."

        if run.get("enemy") and run["enemy"].get("hp", 0) <= 0:
            defeated = run["enemy"]
            reward = int(defeated.get("gold", 10) * (1 + (run["stage"] - 1) * 0.25))
            actor["gold"] += reward
            actor.setdefault("materials", {})[defeated.get("drop", "Pedra")] = actor.setdefault("materials", {}).get(defeated.get("drop", "Pedra"), 0) + 1
            run["enemy"] = None
            run["phase"] = "exploration"
            run["resolved"] = int(run.get("resolved", 0)) + 1
            meta = room.setdefault("runMeta", {"threat": 0, "resolved": 0})
            meta["resolved"] = run["resolved"]
            if defeated.get("boss"):
                run["stage"] += 1
                run["step"] = 0
                meta["threat"] = 0
                if run["stage"] > 3:
                    run["phase"] = "complete"
                    run["stage"] = 3
                    log += f" {defeated['name']} caiu! A expedição foi concluída; o grupo conquistou {reward} moedas e materiais."
                else:
                    log += f" {defeated['name']} caiu! O caminho para a região {run['stage']} foi aberto. Reúnam-se e prossigam."
            else:
                log += f" {defeated['name']} foi derrotado. Recompensa: {reward} moedas e {defeated.get('drop', 'Pedra').lower()}."
        else:
            # End of a party round: the enemy acts against one living adventurer.
            alive_order = _alive_ids(run)
            if run.get("phase") == "encounter" and end_of_round and alive_order:
                target_id = alive_order[secrets.randbelow(len(alive_order))]
                target = run["party"][target_id]
                incoming = max(1, int(run["enemy"].get("attack", 8)) + secrets.randbelow(5) - 2)
                if target.get("guard"):
                    incoming = max(1, incoming // 3)
                    target["guard"] = False
                target["hp"] = max(0, target["hp"] - incoming)
                target["alive"] = target["hp"] > 0
                log += f" {run['enemy']['name']} ataca {target['name']} e causa {incoming} de dano."
                if not _alive_ids(run):
                    run["phase"] = "failed"
                    log += " O grupo caiu. A expedição terminou; os dados pessoais anteriores continuam salvos."
            elif run.get("phase") == "exploration":
                log += " A trilha está livre por enquanto."

    # Advance to the next living party member after every successful action.
    order = run.get("turnOrder", [])
    if order:
        try:
            idx = order.index(uid)
        except ValueError:
            idx = -1
        run["turnIndex"] = (idx + 1) % len(order)
        _current_turn(run)
    run["members"] = list(run.get("party", {}).keys())
    run["log"] = log[:400]
    return True, run["log"]


@socketio.on("coop_send")
def on_coop_send(data=None):
    info = SOCKET_USERS.get(request.sid)
    if not info or not info.get("room"):
        return {"ok": False, "error": "Entre em uma sala antes de agir."}
    code = info["room"]
    body = data if isinstance(data, dict) else {}
    payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
    kind = str(payload.get("type") or "")
    with ROOM_LOCK:
        room = ROOMS.get(code)
        if not room or info["id"] not in room["players"]:
            return {"ok": False, "error": "A sala não existe mais. Crie outra."}
        if kind == "run_start":
            if room.get("hostId") != info["id"]:
                return {"ok": False, "error": "Somente o anfitrião pode iniciar uma expedição."}
            if len(room["players"]) < 2:
                return {"ok": False, "error": "Convide pelo menos um amigo antes de começar a expedição."}
            difficulty = str(payload.get("difficulty") or "medium")[:16]
            room["run"] = make_shared_run(room, difficulty)
            room["runMeta"] = {"threat": 0, "resolved": 0}
            packet = {"type": "run_start", "run": room["run"], "from": info["id"]}
            socketio.emit("coop_message", packet, to=code)
            emit_roster(code)
            return {"ok": True, "run": room["run"]}
        if kind != "player_action":
            return {"ok": False, "error": "Mensagem cooperativa desconhecida ou antiga."}
        action = str(payload.get("action") or "")
        if action not in {"explore", "gather", "rest", "attack", "magic", "defend", "heal"}:
            return {"ok": False, "error": "Ação não reconhecida."}
        ok, message = apply_shared_action(room, info["id"], action)
        if not ok:
            return {"ok": False, "error": message, "run": room.get("run")}
        packet = {"type": "run_state", "run": room["run"], "from": info["id"], "action": action}
        socketio.emit("coop_message", packet, to=code)
        emit_roster(code)
        return {"ok": True, "run": room["run"], "message": message}


@socketio.on("room_leave")
def on_room_leave():
    remove_socket_from_room(request.sid)


@socketio.on("disconnect")
def on_disconnect(reason=None):
    remove_socket_from_room(request.sid)
    SOCKET_USERS.pop(request.sid, None)


@app.delete("/api/rooms/invite/<int:invite_id>")
@login_required
def dismiss_room_invite(invite_id: int):
    uid = current_user_id()
    with db_session() as conn:
        result = conn.execute(
            "DELETE FROM room_invites WHERE id=? AND receiver_id=?",
            (invite_id, uid),
        )
        if result.rowcount < 1:
            return json_error("Convite não encontrado ou não pertence à sua conta.", 404)
    return jsonify(ok=True, message="Convite removido."), 200


@app.post("/api/rooms/invite")
@login_required
def create_room_invite():
    uid = current_user_id()
    body = json_body()
    friend_id = str(body.get("friendId") or "").strip()
    room_code = re.sub(r"[^A-Z0-9]", "", str(body.get("roomCode") or "").upper())
    if not re.fullmatch(r"[A-Z0-9]{6}", room_code):
        return json_error("Código de sala inválido.", 400)
    if not friend_id or friend_id == uid:
        return json_error("Escolha um amigo válido.", 400)
    with db_session() as conn:
        friendship = conn.execute("""
            SELECT 1 FROM friend_requests WHERE status='accepted' AND
            ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))
        """, (uid, friend_id, friend_id, uid)).fetchone()
        if not friendship:
            return json_error("Só é possível convidar alguém da sua lista de amigos.", 403)
        conn.execute("""
            INSERT INTO room_invites(room_code, sender_id, receiver_id)
            VALUES (?, ?, ?)
            ON CONFLICT(room_code, sender_id, receiver_id) DO UPDATE SET created_at=CURRENT_TIMESTAMP
        """, (room_code, uid, friend_id))
        friend = conn.execute("SELECT username FROM users WHERE id=?", (friend_id,)).fetchone()
    return jsonify(ok=True, message=f"Convite de partida enviado para {friend['username']}.", roomCode=room_code), 201


@app.get("/api/friends")
@login_required
def friends_list():
    uid = current_user_id()
    with db_session() as conn:
        friends = conn.execute("""
            SELECT u.id, u.username, u.email, fr.updated_at
            FROM friend_requests fr JOIN users u
              ON u.id = CASE WHEN fr.sender_id = ? THEN fr.receiver_id ELSE fr.sender_id END
            WHERE fr.status = 'accepted' AND (fr.sender_id = ? OR fr.receiver_id = ?)
            ORDER BY lower(u.username)
        """, (uid, uid, uid)).fetchall()
        incoming = conn.execute("""
            SELECT fr.id, u.id AS user_id, u.username, u.email, fr.created_at
            FROM friend_requests fr JOIN users u ON u.id = fr.sender_id
            WHERE fr.receiver_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
        """, (uid,)).fetchall()
        outgoing = conn.execute("""
            SELECT fr.id, u.id AS user_id, u.username, u.email, fr.created_at
            FROM friend_requests fr JOIN users u ON u.id = fr.receiver_id
            WHERE fr.sender_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
        """, (uid,)).fetchall()
        room_invites = conn.execute("""
            SELECT ri.id, ri.room_code, ri.created_at, u.username AS sender_username
            FROM room_invites ri JOIN users u ON u.id = ri.sender_id
            WHERE ri.receiver_id = ? ORDER BY ri.created_at DESC LIMIT 25
        """, (uid,)).fetchall()
    return jsonify(
        friends=[dict(r) for r in friends],
        incoming=[dict(r) for r in incoming],
        outgoing=[dict(r) for r in outgoing],
        roomInvites=[dict(r) for r in room_invites],
    )


@app.post("/api/friends/request")
@login_required
def friend_request_create():
    uid = current_user_id()
    body = json_body()
    handle = str(body.get("username") or "").strip()
    if not 2 <= len(handle) <= 24:
        return json_error("Digite o nome exato de um jogador (2 a 24 caracteres).", 400)
    with db_session() as conn:
        target = conn.execute("SELECT id, username FROM users WHERE lower(username) = lower(?)", (handle,)).fetchone()
        if not target:
            return json_error("Não encontrei esse nome de jogador. Confira a grafia exata.", 404)
        if target["id"] == uid:
            return json_error("Você não pode adicionar a si mesmo.", 400)
        pair_rows = conn.execute("""
            SELECT id, sender_id, receiver_id, status FROM friend_requests
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                     updated_at DESC, id DESC
        """, (uid, target["id"], target["id"], uid)).fetchall()
        accepted = next((r for r in pair_rows if r["status"] == "accepted"), None)
        if accepted:
            return json_error("Esse jogador já está na sua lista de amigos.", 409)
        reverse = next((r for r in pair_rows if r["sender_id"] == target["id"] and r["receiver_id"] == uid and r["status"] == "pending"), None)
        if reverse:
            conn.execute("UPDATE friend_requests SET status='accepted', updated_at=CURRENT_TIMESTAMP WHERE id=?", (reverse["id"],))
            # If this client also had an old sent request, accept it too for a single stable friendship.
            conn.execute("UPDATE friend_requests SET status='accepted', updated_at=CURRENT_TIMESTAMP WHERE sender_id=? AND receiver_id=? AND status='pending'", (uid, target["id"]))
            return jsonify(ok=True, accepted=True, message=f"Agora você e {target['username']} são amigos.")
        outgoing = next((r for r in pair_rows if r["sender_id"] == uid and r["receiver_id"] == target["id"] and r["status"] == "pending"), None)
        if outgoing:
            return json_error("Já existe um convite pendente para esse jogador.", 409)
        conn.execute("""
            INSERT INTO friend_requests(sender_id, receiver_id, status)
            VALUES (?, ?, 'pending')
            ON CONFLICT(sender_id, receiver_id) DO UPDATE SET status='pending', updated_at=CURRENT_TIMESTAMP
        """, (uid, target["id"]))
    return jsonify(ok=True, message=f"Convite de amizade enviado para {target['username']}.") , 201


@app.post("/api/friends/respond")
@login_required
def friend_request_respond():
    uid = current_user_id()
    body = json_body()
    try:
        request_id = int(body.get("requestId"))
    except (TypeError, ValueError):
        return json_error("Convite inválido.", 400)
    decision = str(body.get("decision") or "").lower()
    if decision not in {"accept", "decline"}:
        return json_error("Escolha aceitar ou recusar.", 400)
    with db_session() as conn:
        row = conn.execute("SELECT id, sender_id FROM friend_requests WHERE id=? AND receiver_id=? AND status='pending'", (request_id, uid)).fetchone()
        if not row:
            return json_error("Esse convite não está mais pendente.", 404)
        status = "accepted" if decision == "accept" else "declined"
        conn.execute("UPDATE friend_requests SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, request_id))
        sender = conn.execute("SELECT username FROM users WHERE id=?", (row["sender_id"],)).fetchone()
    return jsonify(ok=True, message=(f"Agora vocês são amigos." if decision == "accept" else "Convite recusado."), username=sender["username"] if sender else "Jogador")


@app.delete("/api/friends/<friend_id>")
@login_required
def friend_remove(friend_id: str):
    uid = current_user_id()
    with db_session() as conn:
        cur = conn.execute("""
            DELETE FROM friend_requests
            WHERE status='accepted' AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))
        """, (uid, friend_id, friend_id, uid))
        if not cur.rowcount:
            return json_error("Esse jogador não está na sua lista de amigos.", 404)
    return jsonify(ok=True, message="Amigo removido.")


@app.errorhandler(413)
def too_large(_error):
    return jsonify(error="O pedido ficou maior do que o limite permitido."), 413


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"}
    # Inicie o servidor antes de abrir a página para evitar a primeira conexão recusada.
    if os.environ.get("OPEN_BROWSER", "1").lower() not in {"0", "false", "no"}:
        threading.Timer(1.2, lambda: webbrowser.open_new_tab(f"http://127.0.0.1:{port}")).start()
    socketio.run(app, host="0.0.0.0", port=port, debug=debug, allow_unsafe_werkzeug=True)
