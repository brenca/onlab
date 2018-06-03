const { Serializable } = require('./serializable')

const ExtendedGrammar = { }

ExtendedGrammar.Rule = class ExtendedGrammarRule extends Serializable {
  constructor(leftHandSide, rightHandSide, i) {
    super()
    this.leftHandSide = leftHandSide
    this.rightHandSide = rightHandSide
    this.i = i
  }

  isMergeableWith(other) {
    if (other.leftHandSide.rule.equals(this.leftHandSide.rule)
        && other.getFinalSet() === this.getFinalSet()) {
      return true
    } else {
      return false
    }
  }

  getFinalSet() {
    return this.rightHandSide[this.rightHandSide.length - 1].to
  }
}
Serializable.registerSubclass(ExtendedGrammar.Rule)

ExtendedGrammar.Item = class ExtendedGrammarItem extends Serializable {
  constructor(from, to, rule) {
    super()
    this.from = from
    this.to = to
    this.rule = rule
    this.firsts = []
    this.follows = []
  }

  equals(item) {
    return this.from === item.from
        && this.to === item.to
        && this.rule.equals(item.rule)
  }
}
Serializable.registerSubclass(ExtendedGrammar.Item)

module.exports = ExtendedGrammar
