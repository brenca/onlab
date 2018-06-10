const JSONL = require('./lang/json')
const JSONLang = JSONL.fromSave()

const fs = require('fs')
const test = fs.readFileSync('10k.json', 'utf8')

// console.log(JSON.parse(test));

JSONLang.execute(test)

// JSONLang.execute(JSON.stringify({
//   whatislove: 2,
//   babydonthurtme: 3,
//   asd: ""
// }))
