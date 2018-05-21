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

  buildSPPF(code) {
    const tokenized = this.lexer.tokenize(code)

    if (!tokenized.success) {
      const rest = tokenized.rest.value.match(/^(.*)(\n|$)/i)[1]
      const code = rest.substr(0, 10)

      throw new Error(`${
        tokenized.rest.position.line
      }:${
        tokenized.rest.position.char
      } Could not parse code near '${
        code.length === 10 ? `${code}...` : code
      }'`)
    }

    return new Parser.SPPF.Forest(this.parser.parse(tokenized.tokens))
  }
}

Language.Lexer = Lexer
Language.Parser = Parser

module.exports = Language
