import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { StudiumStore } from '../src/store.js';
import { MemoryResearchRepository } from '../src/repository.js';
import { researchFingerprint, type StoredSemanticAnalysis } from '../src/semantic-service.js';
import type { ExplainedClaim } from '../src/semantic-analyst.js';
import { addSupport, resultFixture } from './semantic-fixtures.js';


describe('semantic proposal synthesis', () => {
  it('requires configured evidence and retains provenance and canonical comparison', () => {
    const store = new StudiumStore();
    addSupport(store,1); addSupport(store,2);
    expect(store.listProposals('world-a')).toEqual([]);
    addSupport(store,3);
    const proposal = store.listProposals('world-a')[0];
    expect(proposal).toMatchObject({ evidenceCount: 3, evidenceStale: false, semantic: { classification: 'character_belief', canonRevision: 'rev-1', minimumEvidence: 3 } });
    expect(proposal.semantic?.canonicalFacts[0].object).toEqual({ kind: 'boolean', value: true });
    expect(proposal.semantic?.claimRefs).toHaveLength(3);
    expect(proposal.orbisDraft.assertion?.holderRefs).toEqual([{ canonicalId: 'mira' }]);
  });
  it('deduplicates repeated analysis and lets an empty extraction supersede old support', () => {
    const store = new StudiumStore(); const { analysis } = addSupport(store,1); addSupport(store,2); addSupport(store,3);
    const first = store.listProposals('world-a')[0];
    store.addSemanticAnalysis({ ...analysis, id: randomUUID(), createdAt: '2030-01-01T00:00:00.000Z' });
    expect(store.listProposals('world-a')[0]).toMatchObject({ id: first.id, evidenceCount: 3 });
    store.addSemanticAnalysis({ ...analysis, id: randomUUID(), createdAt: '2031-01-01T00:00:00.000Z', result: resultFixture() });
    expect(store.listProposals('world-a')[0]).toMatchObject({ id: first.id, evidenceCount: 2, evidenceStale: true });
  });
  it('recomputes support immediately on reroll/retraction and preserves stable identity on reanalysis', () => {
    const store = new StudiumStore(); const { bundle } = addSupport(store,1); addSupport(store,2); addSupport(store,3);
    const original = store.listProposals('world-a')[0]; store.updateProposalStatus(original.id,'accepted');
    bundle.records[0].summary = 'A replacement turn'; store.addBundle(bundle);
    expect(store.getProposal(original.id)).toMatchObject({ evidenceCount: 2, evidenceStale: true });
    expect(() => store.updateProposalStatus(original.id,'accepted')).toThrow('proposal_evidence_stale');
    addSupport(store,1);
    expect(store.getProposal(original.id)).toMatchObject({ evidenceCount: 3, evidenceStale: false, status: 'ready_for_review', createdAt: original.createdAt });
    store.removeBundle('bundle-1'); store.removeBundle('bundle-2'); store.removeBundle('bundle-3');
    expect(store.getProposal(original.id)).toMatchObject({ evidenceCount: 0, evidenceRecordIds: [], evidenceStale: true });
    expect(store.getProposal(original.id)?.semantic?.evidence).toEqual([]);
  });
  it('separates opposing values, classifications, holders and session scopes', () => {
    const store = new StudiumStore(); store.setWorldConfig({ ...store.getWorldConfig('world-a'), minEvidence: 2 });
    for (let n=1;n<=2;n++) addSupport(store,n);
    for (let n=3;n<=4;n++) addSupport(store,n,item => { item.claim.object = { kind: 'boolean', value: true }; });
    for (let n=5;n<=6;n++) addSupport(store,n,item => { item.claim.classification = 'rumor'; item.claim.holderRefs = []; });
    for (let n=7;n<=8;n++) addSupport(store,n,item => { item.scope = { kind: 'session', sessionId: 'other-save', at: 'turn-1' }; });
    for (let n=9;n<=10;n++) addSupport(store,n,item => { item.claim.holderRefs = [{ candidateKey: 'another-holder' }]; });
    const proposals = store.listProposals('world-a');
    expect(proposals).toHaveLength(5);
    expect(proposals.every(p => p.evidenceCount === 2)).toBe(true);
    expect(proposals.filter(p => p.semantic!.competingProposalIds.length)).toHaveLength(2);
  });
  it('uses structured runtime evidence without mixing it with objective candidates', () => {
    const store = new StudiumStore(); store.setWorldConfig({ ...store.getWorldConfig('world-a'), minEvidence: 2 });
    for (let n=1;n<=2;n++) addSupport(store,n,item => { item.claim.classification='runtime_fact'; item.claim.holderRefs=[]; item.claim.evidence[0].authority='runtime_state'; });
    for (let n=3;n<=4;n++) addSupport(store,n,item => { item.claim.classification='world_fact_candidate'; item.claim.holderRefs=[]; });
    expect(store.listProposals('world-a')).toHaveLength(2);
    expect(store.listProposals('world-a').map(p => p.semantic?.evidence[0].authorities[0]).sort()).toEqual(['narrative_text','runtime_state']);
  });
  it('creates first-class custom relationship edges and normalizes symmetric endpoints', () => {
    const store = new StudiumStore(); store.setWorldConfig({ ...store.getWorldConfig('world-a'), minEvidence: 2 });
    for (let n=1;n<=2;n++) addSupport(store,n,item => {
      item.claim.classification='relationship_development'; item.claim.holderRefs=[]; item.claim.predicate='custom:shares_orbit'; item.relationshipDirection='symmetric';
      item.claim.subject={ candidateKey: n===1?'ship-a':'ship-b', entityType:'custom:starship_class' };
      item.claim.object={ kind:'entity',ref:{ candidateKey:n===1?'ship-b':'ship-a', entityType:'custom:starship_class' } };
    });
    const proposal = store.listProposals('world-a')[0];
    expect(proposal).toMatchObject({ kind:'relationship', evidenceCount:2, semantic:{ relationship:{ direction:'symmetric',predicate:'custom:shares_orbit',source:{ candidateKey:'ship-a' },target:{ candidateKey:'ship-b' } } } });
    expect(proposal.orbisDraft.assertion?.relationship).toEqual(proposal.semantic?.relationship);
  });
  it('preserves custom entity kinds and responds to policy changes without rerunning AI', () => {
    const store=new StudiumStore(); for(let n=1;n<=3;n++) addSupport(store,n,item=>{item.claim.subject={candidateKey:'ship',entityType:'custom:starship_class'};});
    const proposal=store.listProposals('world-a')[0]; expect(proposal.kind).toBe('custom:starship_class');
    store.setWorldConfig({...store.getWorldConfig('world-a'),mode:'conservative'});
    expect(store.getProposal(proposal.id)).toMatchObject({evidenceCount:3,evidenceStale:true});
    store.setWorldConfig({...store.getWorldConfig('world-a'),mode:'exploratory'});
    expect(store.getProposal(proposal.id)).toMatchObject({evidenceCount:3,evidenceStale:false});
  });
  it('never counts old-revision or unfingerprinted analysis as current support', () => {
    const store=new StudiumStore(); const {analysis}=addSupport(store,1); addSupport(store,2); addSupport(store,3);
    store.addSemanticAnalysis({...analysis,id:randomUUID(),createdAt:'2030-01-01T00:00:00.000Z',canonProjection:{...analysis.canonProjection!,revision:'rev-2'},result:{...analysis.result,canonRevision:'rev-2'}});
    expect(store.listProposals('world-a')[0]).toMatchObject({evidenceCount:1,evidenceStale:true});
    const legacy=new StudiumStore(); for(let n=1;n<=3;n++){const {analysis:a}=addSupport(legacy,n);legacy.addSemanticAnalysis({...a,id:randomUUID(),sourceBindings:undefined,canonProjection:undefined});}
    expect(legacy.listProposals('world-a')[0].evidenceCount).toBe(3); // old records add no support
  });
  it('keeps edits through resynthesis and restricts editing to the owner and draft text',async()=>{
    const repository=new MemoryResearchRepository();
    const id=await repository.run('world-a','owner:alice',store=>{for(let n=1;n<=3;n++)addSupport(store,n);return store.listProposals('world-a')[0].id;});
    const app=createApp({repository,authenticateOwner:async token=>token==='alice'?{subject:'alice',worldIds:['world-a']}:{subject:'bob',worldIds:['world-b']}});
    await request(app).patch(`/api/v1/proposals/${id}/draft`).set('Authorization','Bearer bob').send({name:'No',summary:'No'}).expect(403);
    await request(app).patch(`/api/v1/proposals/${id}/draft`).set('Authorization','Bearer alice').send({name:'New',summary:'Owner text',evidenceCount:99}).expect(400);
    await request(app).patch(`/api/v1/proposals/${id}/draft`).set('Authorization','Bearer alice').send({name:'New',summary:'Owner text'}).expect(200);
    const response=await request(app).post('/api/v1/worlds/world-a/synthesize').set('Authorization','Bearer alice').send({}).expect(200);
    expect(response.body).toMatchObject({canonChanged:false,proposals:[{draftEdited:true,orbisDraft:{name:'New',summary:'Owner text'}}]});
    const report=await request(app).post('/api/v1/worlds/world-a/weekly-report').set('Authorization','Bearer alice').expect(201);
    expect(report.body.report.proposalCount).toBe(1);
  });
});
