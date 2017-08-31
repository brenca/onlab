const Lexer = require('./lexer')
const Parser = require('./parser')

class Language {
  constructor() {
    this._lexer = new Lexer()
    this._parser = new Parser(this)
  }
  
  get lexer() {
    return this._lexer
  }
  
  get parser() {
    return this._parser
  }
  
  buildAST(code) {
    let tokenized = this._lexer.tokenize(code)
    if (!tokenized.success) throw Error('could not tokenize code')
    // const profiler = require('@risingstack/v8-profiler')
    // const fs = require('fs')
    // profiler.startProfiling('profile', true)
    
    let p = this._parser.parse(tokenized.tokens)
    
    // let profile = profiler.stopProfiling()
    // profile.export(function(error, result) {
    //   fs.writeFileSync('profile.cpuprofile', result)
    //   profile.delete();
    // })
    
    return p
  }
}

Language.Lexer = Lexer
Language.Parser = Parser

module.exports = Language