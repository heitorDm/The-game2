"""Small dependency-free behavioral checks for the shared-run engine in app.py."""
import ast, secrets
from pathlib import Path
source=Path('app.py').read_text(encoding='utf-8')
tree=ast.parse(source)
namespace={'secrets':secrets}
for node in tree.body:
    if isinstance(node, ast.Assign):
        names=[t.id for t in node.targets if isinstance(t, ast.Name)]
        if any(name in {'CLASS_PROFILES','RUN_MATERIALS','RUN_ENEMIES','RUN_BOSSES'} for name in names):
            exec(compile(ast.Module(body=[node], type_ignores=[]), 'app.py', 'exec'), namespace)
    elif isinstance(node, ast.FunctionDef) and node.name in {'make_shared_run','_alive_ids','_current_turn','apply_shared_action'}:
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'app.py', 'exec'), namespace)
make_run=namespace['make_shared_run']; action=namespace['apply_shared_action']
room={'players': {
 'u1': {'classId':'campones','name':'Alice'},
 'u2': {'classId':'mago','name':'Bruno'},
}}
run=make_run(room); room['run']=run; room['runMeta']={'threat':0,'resolved':0}
assert run['phase']=='exploration' and len(run['party'])==2
ok,msg=action(room,'u2','gather'); assert not ok and 'Aguarde' in msg, (ok,msg)
first=run['turnOrder'][0]
# Ensure an action advances the turn and updates shared materials.
ok,msg=action(room,first,'gather'); assert ok, msg
assert sum(run['party'][first]['materials'].values()) >= 1
assert namespace['_current_turn'](run) != first
# Normal combat: first action has no enemy retaliation, last living actor ends the round.
run['phase']='encounter'; run['enemy']={'name':'Alvo de teste','hp':999,'maxHp':999,'attack':10,'gold':40,'drop':'Ferro'}
run['turnIndex']=0
p1,p2=run['turnOrder']
start_hp=sum(p['hp'] for p in run['party'].values())
ok,_=action(room,p1,'attack'); assert ok
ok,_=action(room,p2,'attack'); assert ok
assert sum(p['hp'] for p in run['party'].values()) < start_hp, 'enemy should retaliate after party round'
# Server-authoritative rewards are applied when an encounter is defeated.
run['phase']='encounter'; run['enemy']={'name':'Fraco','hp':1,'maxHp':1,'attack':1,'gold':15,'drop':'Trigo'}
run['turnIndex']=run['turnOrder'].index(p1)
run['party'][p1]['attack']=99
before=run['party'][p1]['gold']
ok,msg=action(room,p1,'attack'); assert ok, msg
assert run['phase']=='exploration' and run['enemy'] is None
assert run['party'][p1]['gold'] >= before
assert run['party'][p1]['materials'].get('Trigo',0)>=1
# A boss victory opens the next region; the third closes the expedition.
for expected_stage in (2, 3, 4):
    run['stage'] = min(expected_stage - 1, 3)
    run['phase'] = 'encounter'
    run['enemy'] = {'name':'Chefe de teste','hp':1,'maxHp':1,'attack':1,'gold':80,'drop':'Cristal lunar','boss':True}
    run['turnOrder'] = ['u1','u2']; run['turnIndex'] = 0
    run['party']['u1']['alive'] = True; run['party']['u1']['hp'] = max(1,run['party']['u1']['hp'])
    ok, msg = action(room, 'u1', 'attack'); assert ok, msg
    if expected_stage <= 3:
        assert run['stage'] == expected_stage and run['phase'] == 'exploration'
    else:
        assert run['stage'] == 3 and run['phase'] == 'complete'
# A dead/disconnected party member is skipped instead of trapping the turn.
run['phase']='exploration'; run['turnOrder']=['u1','u2']; run['party']['u2']['alive']=False; run['party']['u2']['hp']=0
run['turnIndex']=1
assert namespace['_current_turn'](run)=='u1'
print('PASS: create run, reject out-of-turn action, gather, round retaliation, server reward, boss region progression, completion and skip down player')
