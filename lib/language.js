const Lexer = require('./lexer')
const Parser = require('./parser')
const { Serializable } = require('./serializable')

class Language {
  get lexer() {
    if (this._lexer === undefined)
      this._lexer = new Lexer()
    return this._lexer
  }

  get parser() {
    if (this._parser === undefined)
      this._parser = new Parser(this)
    return this._parser
  }

  save() {
    const { RULES, ESPPFMAP, ITEMSETS } = this.parser.data

    return Serializable.serialize({
      RULES, ESPPFMAP, ITEMSETS, LEXER: this.lexer
    })
  }

  load(json) {
    const { RULES, ESPPFMAP, ITEMSETS, LEXER } = Serializable.deserialize(json)
    this._lexer = LEXER
    this.parser.setup(RULES, ESPPFMAP, ITEMSETS)
  }

  buildSPPF(code) {
    const tokenized = this.lexer.tokenize(code)

    console.log('tokenized');

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

    const parseResult = this.parser.parse(tokenized.tokens)
    return new Parser.SPPF.Forest(parseResult.root, parseResult.ambiguous)
  }
}

Language.Lexer = Lexer
Language.Parser = Parser

module.exports = Language
