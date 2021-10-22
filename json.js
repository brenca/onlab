const JSONL = require('./lang/json')
const JSONLang = JSONL.fromBNF()

const fs = require('fs')
const test = fs.readFileSync('10k.json', 'utf8')

console.time('JSON')
JSON.parse(test)
console.timeLog('JSON')

console.time('JSONLang')
JSONLang.execute(test)
console.timeLog('JSONLang')

// JSONLang.execute(JSON.stringify({
//   whatislove: 2,
//   babydonthurtme: 3,
//   asd: ""
// }))
