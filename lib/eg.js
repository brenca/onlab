const ExtendedGrammar = { }

ExtendedGrammar.Rule = class {
  constructor(leftHandSide, rightHandSide, i) {
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

ExtendedGrammar.Item = class {
  constructor(from, to, rule) {
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

module.exports = ExtendedGrammar
