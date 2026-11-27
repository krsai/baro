import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('brand style detail preserves product identity, revision and photos without factory writes', async () => {
  const calls = [];
  const product = {id: 41, revision: 3, fields: {code: 'AP2039', name: 'Original', designer: 'Designer', season: 'Winter', imageUrls: ['https://example.com/photo.jpg']}};
  globalThis.__brandStyleTest = {
    buildQueryString: ({orgId}) => '?orgId=' + orgId,
    createHttpError: (message, status) => Object.assign(new Error(message), {status}),
    requestJSON: async (url, options) => { calls.push({url, options}); return options.method ? {...product, revision: 4, fields: JSON.parse(options.body).fields} : [product]; },
    emitWorkspaceDataChanged: () => {}, WORKSPACE_DATA_TOPICS: {STYLES: 'styles'},
  };
  try {
    const source = readFileSync('frontend/src/utils/brandStyleApi.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
    const api = await import('data:text/javascript;base64,' + Buffer.from('const {buildQueryString,createHttpError,requestJSON,emitWorkspaceDataChanged,WORKSPACE_DATA_TOPICS}=globalThis.__brandStyleTest;\n' + source).toString('base64'));
    const style = await api.fetchBrandStyle('41', 2, 'THE SAN');
    assert.equal(style.id, 41);
    assert.equal(style.styleCode, 'AP2039');
    const saved = await api.saveBrandStyle({...style, name: 'Updated', processes: [{secret: true}], bom: ['private']}, 2, '41');
    const body = JSON.parse(calls[1].options.body);
    assert.equal(calls[1].url, '/brand-sewing/styles/41?orgId=2');
    assert.equal(body.revision, 3);
    assert.deepEqual(Object.keys(body.fields).sort(), ['code','name','registrationDate','designer','season','imageUrls'].sort());
    assert.deepEqual(body.fields.imageUrls, product.fields.imageUrls);
    assert.equal(saved.revision, 4);
    await assert.rejects(api.fetchBrandStyle('999', 2), {status: 404});
  } finally { delete globalThis.__brandStyleTest; }
});
