import assert from 'node:assert/strict'
import {build} from 'esbuild'
const result=await build({entryPoints:['src/prescriptionChoices.ts'],bundle:true,write:false,format:'esm',platform:'node'})
const {prescriptionChoice,completeChoice,choiceSummary}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
const base={key:'ref:clinic-amoxiclav-625',code:'clinic-amoxiclav-625',name:'Amoxiclav',strength:'625 mg',form:'Tablet',route:'Oral',default_dose:'1 tablet',frequency:'BID',instructions:'After meals'}
const amox=prescriptionChoice(base)
assert.equal(completeChoice(amox),true)
assert.equal(amox.duration,'3 days')
assert.ok(choiceSummary(amox).includes('BD'))
const sos=prescriptionChoice({...base,key:'ref:clinic-zerodol-sp',code:'clinic-zerodol-sp',name:'Zerodol',strength:'SP'})
assert.match(sos.duration,/SOS/)
assert.equal(completeChoice(sos),true)
const edited={...amox,duration:'5 days',frequency:'TID'}
const reused=prescriptionChoice(base,edited)
assert.equal(reused.duration,'5 days')
reused.duration='7 days'
assert.equal(edited.duration,'5 days','Adding a choice must not mutate the saved template')
const pediatric=prescriptionChoice({...base,code:'pediatric',default_dose:'',frequency:''})
assert.equal(completeChoice(pediatric),false,'Do not invent pediatric dose or duration')
console.log('Requested presets, SOS, editable reusable choices and missing-dose checks passed')
