import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retentionOrigin} from '../frontend/build-with-retained-assets.mjs';
const read=path=>JSON.parse(readFileSync(path,'utf8'));
test('frontend Railway uses a package-local build without leaking retention flags into TypeScript',()=>{
 const frontend=read('frontend/railway.json'),backend=read('backend/railway.json');
 assert.equal(frontend.build.buildCommand,'npm run build');
 assert.equal(read('frontend/package.json').scripts.build,'node build-with-retained-assets.mjs');
 assert.equal(read('backend/package.json').scripts.build,'tsc');
 assert.ok(!frontend.build.buildCommand.includes('--retain-from'));
 assert.equal(backend.build.buildCommand,'npm run prisma:prepare-client && npm run build');
 assert.equal(backend.deploy.preDeployCommand,'npm run railway:predeploy');
 assert.equal(backend.deploy.healthcheckPath,'/ready');
});
test('production asset retention stays enabled without command forwarding and does not run in local builds',()=>{
 const railway={RAILWAY_SERVICE_ID:'frontend',RAILWAY_ENVIRONMENT_NAME:'production'};
 assert.equal(retentionOrigin([],railway),'https://www.barogarment.com');
 assert.equal(retentionOrigin([],{NODE_ENV:'production'}),null);
 assert.equal(retentionOrigin([],{...railway,RAILWAY_ENVIRONMENT_NAME:'staging'}),null);
 assert.equal(retentionOrigin([],{FRONTEND_RETAIN_FROM:'https://preview.example.test'}),'https://preview.example.test');
 assert.equal(retentionOrigin(['--retain-from=https://explicit.example.test'],railway),'https://explicit.example.test');
 assert.throws(()=>retentionOrigin(['--retain-from='],railway),/empty/);
});
