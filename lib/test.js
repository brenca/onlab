const Language = require('../lib/language')
const EventEmitter = require('events')
const { Lexer, Parser } = Language

class Test extends Language {
  constructor(handler) {
    super()
    
    this.lexer.addTokenClasses([
      new Lexer.TokenClass('char', /\S/iu)
    ])
    
    this.parser.fromBNF(
      `
      <A> ::= <B> <C> "d" | <E> <C> "f"
      <B> ::= "x" "y"
      <E> ::= "x" "y"
      <C> ::= <C> "c" | "c"
      `
    )
  }
  
  execute(code) {
    let pp = (node, indent = 0) => {
      let ind = Array(indent + 1).join('  ')
      console.log(ind + (node.rule.name || node.rule.value))
      node.children.forEach(child => {
        pp(child, indent + 1)
      })
    }
    pp(this.buildAST(code)[0])
  }
}

module.exports = Test