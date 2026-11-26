import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DAY, endpoints, entityCode, extractEntities, extractEvents, extractSignals, parseWindow, shareHref} from '../web/model.mjs';

test('supports country, region and ASN IDs; date ranges are inclusive in UTC',()=>{
  assert.equal(entityCode('country','ca'),'CA');
  assert.equal(entityCode('asn','AS812'),'812');
  assert.equal(entityCode('region','576'),'576');
  assert.equal(entityCode('asn','99999999999'),null);
  assert.equal(entityCode('country','CA?'),null);
  const window=parseWindow('2022-07-07','2022-07-10');
  assert.equal(window.until-window.from,4*DAY);
  assert.throws(()=>parseWindow('2022-02-30','2022-03-02'),/valid date/);
  assert.throws(()=>parseWindow('2022-01-01','2022-02-01'),/at most 30/);
  const urls=endpoints('asn','812',window);
  assert.equal(new URL(urls.events).searchParams.get('entityCode'),'812');
  assert.match(urls.signals,/\/signals\/raw\/asn\/812\?/);
  assert.equal(new URL(shareHref('https://coolcode.ca/outagescope/#anchor',{type:'asn',code:'812'})).hash,'');
});
test('adapts nested signal payloads and retains gaps and zero values',()=>{
  const scope={from:100,until:200};
  const item={entityType:'country',entityCode:'CA',datasource:'bgp',from:90,step:30,values:[1,2,null,0,3]};
  const results=extractSignals({data:[[item,{...item,entityCode:'US'},{...item,datasource:'gtr'}]]},'country','CA',scope);
  assert.equal(results.length,1);
  assert.deepEqual(results[0].samples,[{t:120,v:2},{t:150,v:null},{t:180,v:0}]);
});
test('scopes reported detections and validates entity search responses',()=>{
  assert.deepEqual(extractEvents({data:[{start:3,duration:8,datasource:'bgp'},{start:200,duration:8}]},{from:10,until:20})
    .map(row=>row.source),['bgp']);
  assert.deepEqual(extractEntities({data:[{type:'region',code:'576',name:'British Columbia',attrs:{country_name:'Canada'}}]},'region'),
    [{code:'576',name:'British Columbia',context:'Canada'}]);
  assert.throws(()=>extractEvents({error:'not found'},{}),/IODA reported/);
});

test('each published provider page has its own ASN, canonical, assets and matching IODA form',async()=>{
  const fs=await import('node:fs/promises');
  const {execFileSync}=await import('node:child_process');
  const root=new URL('../',import.meta.url);
  execFileSync('python3',['scripts/build.py'],{cwd:root});
  const records=JSON.parse(await fs.readFile(new URL('web/providers.json',root),'utf8'));
  for(const {slug,asn,name} of records){
    const page=await fs.readFile(new URL('dist/'+slug+'/index.html',root),'utf8');
    assert.ok(page.includes('data-asn="'+asn+'"') && page.includes('<h1>'+name+' internet outage signals</h1>'));
    assert.ok(page.includes('rel="canonical" href="https://coolcode.ca/outagescope/'+slug+'/"'));
    assert.ok(page.includes('../app.mjs') && page.includes('id="lookup"'));
  }
});
