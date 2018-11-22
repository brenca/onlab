const Lexer = require('./lexer')
const Parser = require('./parser')
const { Serializable } = require('./serializable')

const LZUTF8 = require('lzutf8')

class Language {
  get lexer() {
    if (this.$lexer === undefined)
      this.$lexer = new Lexer()
    return this.$lexer
  }

  get parser() {
    if (this.$parser === undefined)
      this.$parser = new Parser(this)
    return this.$parser
  }

  save() {
    const { RULES, ESPPFMAP, ITEMSETS } = this.parser.data

    return LZUTF8.compress(Serializable.serialize({
      RULES, ESPPFMAP, ITEMSETS, LEXER: this.lexer
    }), { outputEncoding: 'Buffer' })
  }

  load(json) {
    const { RULES, ESPPFMAP, ITEMSETS, LEXER } = Serializable.deserialize(
      LZUTF8.decompress(json, { inputEncoding: 'Buffer' })
    )

    this.$lexer = LEXER
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
