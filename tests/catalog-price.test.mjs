import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogPrice} from '../src/catalog-price.ts';
test('menu and cost are distinct; unavailable menu falls back to known cost',()=>{
  assert.deepEqual(catalogPrice({menuPrice:450,costPrice:125}),{label:'Цена меню',value:450});
  assert.deepEqual(catalogPrice({menuPrice:0,costPrice:125}),{label:'Себестоимость',value:125});
  assert.deepEqual(catalogPrice({menuPrice:null}),{label:'Цена',value:null});
});
test('real zero is retained, placeholders and malformed prices are not displayed as zero',()=>{
  assert.equal(catalogPrice({menuPrice:0,menuPriceStatus:'available'}).value,0);
  assert.equal(catalogPrice({costPrice:0}).value,0);
  assert.equal(catalogPrice({menuPrice:'',costPrice:'broken'}).value,null);
  assert.equal(catalogPrice({menuPrice:450,menuPriceStatus:'unavailable'}).value,null);
});
