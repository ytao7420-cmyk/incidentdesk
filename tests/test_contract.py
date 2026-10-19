"""Deterministic rule tests with explicit mocked HTTP/LLM responses; not chain evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest

ROOT=Path(__file__).resolve().parents[1]
OWNER='0x'+'1'*40
CUSTOMER='0x'+'2'*40
OTHER='0x'+'3'*40
class UserError(Exception): pass
class Disagreement(Exception): pass
class TreeMap(dict): pass
class Return:
    def __init__(self,calldata): self.calldata=calldata
class Contract:
    def __new__(cls):
        obj=object.__new__(cls)
        for name in cls.__annotations__: setattr(obj,name,TreeMap())
        return obj
class Runtime:
    def __init__(self):
        self.answers=[];self.fetches=[];self.bodies=[];self.status=200
        self.gl=types.SimpleNamespace(Contract=Contract,public=types.SimpleNamespace(view=lambda f:f,write=lambda f:f),message=types.SimpleNamespace(sender_address=types.SimpleNamespace(as_hex=OWNER)),nondet=types.SimpleNamespace(web=types.SimpleNamespace(get=self.fetch),exec_prompt=self.prompt),eq_principle=types.SimpleNamespace(strict_eq=self.strict),vm=types.SimpleNamespace(UserError=UserError,Return=Return,run_nondet_unsafe=self.run))
    def fetch(self,url,headers):
        self.fetches.append(url)
        b=self.bodies.pop(0) if len(self.bodies)>1 else self.bodies[0]
        return types.SimpleNamespace(status=self.status,body=b)
    def prompt(self,*a,**kw): return copy.deepcopy(self.answers.pop(0))
    def strict(self,fn):
        a,b=fn(),fn()
        if a!=b: raise Disagreement('Sources differ')
        return a
    def run(self,leader,validator):
        a=leader()
        if not validator(Return(copy.deepcopy(a))): raise Disagreement('Semantics differ')
        return a
    def load(self):
        mod=types.ModuleType('genlayer');mod.__all__=['gl','TreeMap'];mod.gl=self.gl;mod.TreeMap=TreeMap
        old=sys.modules.get('genlayer');sys.modules['genlayer']=mod
        try:
            spec=importlib.util.spec_from_file_location('incidentdesk_test',ROOT/'contracts/incidentdesk.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
        finally:
            if old:sys.modules['genlayer']=old
            else:del sys.modules['genlayer']

class Tests(unittest.TestCase):
    def setUp(self):
        self.r=Runtime();self.m=self.r.load();self.c=self.m.IncidentDesk()
        self.src=[json.loads((ROOT/'public/sources'/f'{i}.json').read_text()) for i in ['6yk962mhlr3h','93njd414rpbx']]
    def open(self): self.c.open_case('case',CUSTOMER,'github','GitHub Actions workflow execution','2026-10-12','2026-10-14')
    def record(self):return json.loads(self.c.get_case('case'))
    def capture(self,n=0):
        src=self.src[n];p=src['projection'];updates=[dict(r,incident_id=p['incident_id']) for r in p['updates']]
        self.r.bodies=[json.dumps({'page':{'updated_at':'VOLATILE'},'incident':{'id':p['incident_id'],'name':p['name'],'status':p['status'],'page_id':'kctbh9vrtdwd','incident_updates':updates}}).encode()]
        self.c.capture_incident('case',p['incident_id'],src['sha256'])
    def answers(self,n=0,impact='EXPLICIT_NO_IMPACT'):
        p=self.src[n]['projection'];row=p['updates'][-1]
        val={'scope':'IN_SCOPE','window':'IN_WINDOW','impact':impact,'reason':'Source-backed fixture','citations':[{'update_id':row['id'],'quote':row['body'][:900]}]}
        self.r.answers.extend([copy.deepcopy(val),copy.deepcopy(val),{'scope_supported':True,'window_supported':True,'impact_supported':True,'citations_substantive':True}]);return val
    def reviewed(self):self.open();self.capture();self.answers();self.c.evaluate('case')
    def challenge(self):
        self.r.gl.message.sender_address.as_hex=CUSTOMER
        self.c.challenge('case',self.record()['revisions'][-1]['digest'],'Consider the additional official incident')
    def test_precommit_and_no_duplicate_id(self):
        self.open();c=self.record();self.assertEqual(c['scope_digest'],self.m._hash(self.m._json(c['scope'])))
        with self.assertRaises(UserError):self.open()
    def test_bad_dates_and_reversed_dates(self):
        for a,b in [('2026-02-30','2026-03-01'),('2026-10-15','2026-10-12')]:
            with self.assertRaises(UserError):self.c.open_case('c',CUSTOMER,'github','feature',a,b)
    def test_distinct_customer_required(self):
        with self.assertRaises(UserError):self.c.open_case('c',OWNER,'github','feature','2026-01-01','2026-01-02')
    def test_allowlist(self):
        with self.assertRaises(UserError):self.c.open_case('c',CUSTOMER,'arbitrary','f','2026-01-01','2026-01-02')
    def test_capture_projection_is_independent(self):
        self.open();self.capture();self.assertEqual(len(self.r.fetches),2);self.assertEqual(self.record()['evidence'][0]['projection'],self.src[0]['projection'])
    def test_bad_hash(self):
        self.open();self.capture();self.r.bodies=[b'{}']
        with self.assertRaises(UserError):self.c.capture_incident('case','6yk962mhlr3h','0'*64)
    def test_duplicate_snapshot(self):
        self.open();self.capture()
        with self.assertRaises(UserError):self.capture()
    def test_third_party_cannot_capture(self):
        self.open();self.r.gl.message.sender_address.as_hex=OTHER
        with self.assertRaises(UserError):self.capture()
    def test_no_evidence_no_review(self):
        self.open()
        with self.assertRaises(UserError):self.c.evaluate('case')
    def test_reconciles_initial_negative_statement(self):
        self.reviewed();self.assertEqual(self.record()['revisions'][0]['outcome'],'EXPLICIT_NO_IMPACT_IN_CAPTURED_INCIDENTS')
    def test_disagreement_does_not_create_revision(self):
        self.open();self.capture();self.answers();self.r.answers[1]['impact']='REPORTED_IMPACT'
        with self.assertRaises(Disagreement):self.c.evaluate('case')
        self.assertEqual(self.record()['revisions'],[])
    def test_exact_quote_enforced(self):
        self.open();self.capture();self.answers();self.r.answers[0]['citations'][0]['quote']='invented'
        with self.assertRaises(UserError):self.c.evaluate('case')
    def test_substantive_citation_check(self):
        self.open();self.capture();self.answers();self.r.answers[-1]['citations_substantive']=False
        with self.assertRaises(Disagreement):self.c.evaluate('case')
    def test_cannot_append_evidence_without_challenge(self):
        self.reviewed()
        with self.assertRaises(UserError):self.capture(1)
    def test_challenge_binds_exact_head(self):
        self.reviewed()
        with self.assertRaises(UserError):self.c.challenge('case','a'*64,'stale')
    def test_challenge_needs_new_evidence(self):
        self.reviewed();self.challenge()
        with self.assertRaises(UserError):self.c.evaluate('case')
    def test_customer_revision_workflow(self):
        self.reviewed();first=copy.deepcopy(self.record()['revisions'][0]);self.challenge();self.capture(1);self.answers();self.answers(1,'REPORTED_IMPACT');self.c.evaluate('case');c=self.record();self.assertEqual(c['revisions'][0],first);self.assertEqual(c['revisions'][1]['outcome'],'OPERATOR_REPORTED_IMPACT');self.c.acknowledge('case',c['revisions'][1]['digest']);self.assertEqual(self.record()['state'],'ACKNOWLEDGED')
    def test_operator_cannot_acknowledge(self):
        self.reviewed()
        with self.assertRaises(UserError):self.c.acknowledge('case',self.record()['revisions'][0]['digest'])
    def test_stale_acknowledgement(self):
        self.reviewed();self.r.gl.message.sender_address.as_hex=CUSTOMER
        with self.assertRaises(UserError):self.c.acknowledge('case','a'*64)
    def test_out_of_scope_is_not_no_impact(self):
        self.assertEqual(self.m._outcome([{'semantics':{'scope':'OUT_OF_SCOPE','window':'IN_WINDOW','impact':'EXPLICIT_NO_IMPACT'}}]),'NO_SCOPED_EVIDENCE')
    def test_unknown_is_inconclusive(self):
        self.assertEqual(self.m._outcome([{'semantics':{'scope':'UNCLEAR','window':'IN_WINDOW','impact':'EXPLICIT_NO_IMPACT'}}]),'INCONCLUSIVE')
    def test_reported_impact_not_cancelled_by_distinct_no_impact(self):
        findings=[{'semantics':{'scope':'IN_SCOPE','window':'IN_WINDOW','impact':i}} for i in ['REPORTED_IMPACT','EXPLICIT_NO_IMPACT']]
        self.assertEqual(self.m._outcome(findings),'OPERATOR_REPORTED_IMPACT')
if __name__=='__main__':unittest.main()
