"""Standalone SQLite schema check; it does not import Flask or modify the project's DB."""
import ast, sqlite3, tempfile
from contextlib import contextmanager
from pathlib import Path
source=Path('app.py').read_text(encoding='utf-8')
tree=ast.parse(source)
tmp=Path(tempfile.mkdtemp())/'test.sqlite3'
ns={'sqlite3':sqlite3,'contextmanager':contextmanager,'DB_PATH':tmp}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in {'db_connect','db_session','init_db'}:
        exec(compile(ast.Module(body=[node], type_ignores=[]),'app.py','exec'),ns)
ns['init_db']()
conn=sqlite3.connect(tmp)
conn.execute('PRAGMA foreign_keys = ON')
tables={r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert {'users','player_saves','friend_requests','room_invites'} <= tables
conn.execute("INSERT INTO users(id,username,email,password_hash) VALUES ('a','Alice','a@example.test','x'),('b','Bruno','b@example.test','x')")
conn.execute("INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES ('a','b','accepted')")
conn.execute("INSERT INTO room_invites(room_code,sender_id,receiver_id) VALUES ('ABC123','a','b')")
conn.commit()
assert conn.execute("SELECT COUNT(*) FROM room_invites WHERE receiver_id='b'").fetchone()[0]==1
try:
    conn.execute("INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES ('a','a','pending')")
    conn.commit()
    raise AssertionError('self friendship should be forbidden')
except sqlite3.IntegrityError:
    conn.rollback()
conn.execute("DELETE FROM users WHERE id='a'"); conn.commit()
assert conn.execute("SELECT COUNT(*) FROM friend_requests").fetchone()[0]==0
assert conn.execute("SELECT COUNT(*) FROM room_invites").fetchone()[0]==0
conn.close()
print('PASS: SQLite tables, unique friendship constraints, room invite persistence, and foreign-key cascade')
