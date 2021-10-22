const crypto = require('crypto')
const fast = require('./faster')
const { Serializable } = require('./serializable')

const BNF = require('./bnf.js')
const EBNF = require('./ebnf.js')
const BRNGLR = require('./brnglr.js')

class Parser {
  constructor(parent, bnf) {
    this._parent = parent
    this.data = { }
    if (bnf !== undefined) {
      this.setupFromBNF(bnf)
    }
  }

  setupFromEBNF(ebnf) {
    const RULES = EBNF.parse(ebnf, this._parent)
    const { ESPPFMAP, ITEMSETS } = BRNGLR.setup(RULES)

    this.data = { RULES, ESPPFMAP, ITEMSETS }
    this.setup(RULES, ESPPFMAP, ITEMSETS)
  }

  setupFromBNF(bnf) {
    const RULES = BNF.parse(bnf, this._parent)
    const { ESPPFMAP, ITEMSETS } = BRNGLR.setup(RULES)

    this.data = { RULES, ESPPFMAP, ITEMSETS }
    this.setup(RULES, ESPPFMAP, ITEMSETS)
  }

  setup(RULES, ESPPFMAP, ITEMSETS) {
    // override original parse
    this.parse = (code, resolvers = []) => {
      return BRNGLR.parse(RULES, ESPPFMAP, ITEMSETS, code, resolvers)
    }
  }

  parse() {
    throw new Error(`Parser.setup() must be called before parse can begin`)
  }

  static get SPPF() {
    return require('./sppf.js')
  }
}

module.exports = Parser
