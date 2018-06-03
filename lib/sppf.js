const crypto = require('crypto')
const fast = require('./faster')
const { Serializable } = require('./serializable')

const BNF = require('./bnf.js')

const EPSILON = new BNF.Terminal('')
const SPPF = { }

const packedKids = (node) => node.arcs.length > 0
  && node.arcs[0] instanceof SPPF.PackedNode

const getDecisions = root => {
  const merge = decs => {
    return fast.reduce(decs, (ret, dec) => {
      fast.forEach(Object.keys(dec), hash => {
        ret[hash] = fast.concat(ret[hash] || [], dec[hash])
      })

      return ret
    }, {})
  }

  const combine = arrays => {
    if (arrays.length === 0) {
      return []
    } else {
      let result = fast.map(arrays[0], x => [x])
      for (let i = 1; i < arrays.length; i++) {
        result = fast.reduce(
          fast.map(result,
            r => fast.map(arrays[i], x => fast.concat(r, x))
          ),
          (a, x) => fast.concat(a, x),
          []
        )
      }
      return result
    }
  }

  const diff = (decONE, decTWO) => {
    return fast.reduce(Object.keys(decTWO), (diff, key) => {
      if (!decONE[key]) {
        diff[key] = decTWO[key].slice()
      } else if (decONE[key].length < decTWO[key].length) {
        diff[key] = decTWO[key].slice(decONE[key].length)
      }
      return diff
    }, {})
  }

  const packed = node => node instanceof SPPF.PackedNode

  const generateDecisions = (node, decisions = [{}]) => {
    if (node.arcs.length === 0) {
      return decisions
    } else if (fast.some(node.arcs, arc => !packed(arc))) {
      return fast.reduce(fast.map(decisions, decs => {
        return fast.map(combine([
          [decs],
          combine(
            fast.map(
              node.arcs,
              arc => fast.map(
                generateDecisions(arc, [decs]),
                gd => diff(decs, gd)
              )
            )
          )
        ]), decs => merge(decs))
      }), (a, x) => fast.concat(a, x), [])
    } else {
      return fast.reduce(fast.map(decisions, decs => {
        if (decs[node.hash] === undefined) {
          decs[node.hash] = []
        }

        return fast.reduce(fast.map(fast.filter(
          node.arcs,
          arc => decs[node.hash].indexOf(arc.hash) < 0
        ), arc => {
          const arcHash = {}
          arcHash[node.hash] = [arc.hash]
          return generateDecisions(arc, [
            merge([ decs, arcHash ])
          ])
        }), (a, x) => fast.concat(a, x), [])
      }), (a, x) => fast.concat(a, x), [])
    }
  }

  return generateDecisions(root)
}

const generateParseTrees = (root) =>
  fast.map(getDecisions(root), decision => root.clone(decision))

SPPF.Node = class SPPFNode extends Serializable {
  constructor(hash = undefined) {
    super()
    this.arcs = []
    this.hash = hash ? hash : crypto.createHash('md5').update(
        crypto.randomBytes(20).toString('hex')
      ).digest('hex')
  }

  packs(alfa) {
    return alfa.length === this.arcs.length &&
      fast.reduce(alfa, (a, x, i) => a && x.equals(this.arcs[i]), true)
  }

  equals(other) {
    return this.hash === other.hash
  }

  toString() {
    return 'NOT_IMPLEMENTED'
  }

  dotStyle() {
    return ''
  }

  asOperator() {
    return null
  }

  _copyArcs(decisions, other) {
    if (decisions[other.hash] !== undefined) {
      const hash = decisions[other.hash].shift()

      other.arcs = fast.map(fast.find(this.arcs
        ,arc => arc.hash === hash).arcs
        , arc => arc.clone(decisions))
    } else {
      other.arcs = fast.map(this.arcs, arc => arc.clone(decisions))
    }

    return other
  }

  hasOrIsPacked(seen = []) {
    if (fast.indexOf(seen, this) >= 0) {
      return false
    }

    seen.push(this)

    return this instanceof SPPF.PackedNode ? true : this.hasPacked(seen)
  }

  hasPacked(seen = []) {
    return fast.reduce(
      this.arcs,
      (isPacked, arc) => isPacked || arc.hasOrIsPacked(seen),
      false
    )
  }

  transform(actions, dead = false, seen = []) {
    if (fast.indexOf(seen, this) >= 0) {
      return dead
    }

    seen.push(this)

    this.arcs = fast.reduce(fast.map(this.arcs, arc =>
      arc instanceof SPPF.RightNullablePartNode ? arc.arcs : arc
    ), (a, x) => a.concat(x), [])

    if (packedKids(this)) {
      fast.forEach(actions, action => action(this))
      if (this.arcs.length === 0) {
        return true
      }
    }

    return fast.reduce(
      this.arcs,
      (isDead, arc) => isDead || arc.transform(actions, dead, seen),
      false
    )
  }

  flattenArcs() {
    return fast.reduce(fast.map(this.arcs, arc => {
      if (arc instanceof SPPF.IntermediateNode) {
        return arc.flattenArcs()
      }

      return arc
    }), (a, x) => a.concat(x), [])
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.j, this.hash))
  }
}
Serializable.registerSubclass(SPPF.Node)

SPPF.IntermediateNode = class SPPFIntermediateNode extends SPPF.Node {
  constructor(action, alfa, left, right, hash = undefined) {
    super(hash)
    this.action = action
    this.alfa = alfa
    this.left = left
    this.right = right
  }

  toString() {
    const rule = `'${this.action.rule.name}' ::= ${
      fast.map(this.action.rule.subrules[this.action.i], (rule, i) => {
        return `'${(rule.name || rule.value || `Ɛ`)}'` + (i === this.alfa ?
          '●' : '')
      }).join(' ')
    }`

    const extent = (this.left !== undefined && this.right !== undefined) ?
      `, ${this.left}, ${this.right}` : ''

    return `(${rule}${extent})`
  }

  dotStyle() {
    return `shape="box"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.action, this.alfa, this.left, this.right, this.hash))
  }
}
Serializable.registerSubclass(SPPF.IntermediateNode)

SPPF.PackedNode = class SPPFPackedNode extends SPPF.Node {
  constructor(action, arcs, hash = undefined) {
    super(hash)
    this.action = action
    try {
      if (arcs.constructor.name === 'Array') {
        this.arcs = arcs
      }
    } catch (e) { }
  }

  toString() {
    const rule = `${this.action.rule.name} ::= ${
      fast.map(this.action.rule.subrules[this.action.i], (rule, i) => {
        return (rule.name || rule.value || 'Ɛ') + (i + 1 === this.action.dot ?
          '●' : '')
      }).join(' ')
    }`

    return `${rule}`
  }

  dotStyle() {
    return `shape="oval"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.action, this.arcs))
  }
}
Serializable.registerSubclass(SPPF.PackedNode)

SPPF.SymbolNode = class SPPFSymbolNode extends SPPF.Node {
  constructor(action, left, right, hash = undefined) {
    super(hash)

    this.action = action
    this.left = left
    this.right = right
  }

  asOperator() {
    if (this.action.i === null)
      return null

    const subrules = this.action.rule.subrules[this.action.i]
    if (subrules.length === 1 && subrules[0].isOperator())
      return subrules[0]

    return null
  }

  get item() {
    return this.action.rule || this.action
  }

  toString() {
    const extent = (this.left !== undefined && this.right !== undefined) ?
      `, ${this.left}, ${this.right}` : ''
    return `('${this.item.name}'${extent})`
  }

  dotStyle() {
    return `shape="box" style="rounded"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.action, this.left, this.right, this.hash))
  }
}
Serializable.registerSubclass(SPPF.SymbolNode)

SPPF.RightNullablePartNode = class SPPFRightNullablePartNode extends SPPF.Node {
  constructor(rules, hash = undefined) {
    super(hash)
    this.rules = rules
  }

  dotStyle() {
    return `shape="box" style="rounded"`
  }

  toString() {
    return `('${fast.map(this.rules, rule => rule.name).join('')}')`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.rules, this.hash))
  }
}
Serializable.registerSubclass(SPPF.RightNullablePartNode)

SPPF.TerminalNode = class SPPFTerminalNode extends SPPF.Node {
  constructor(item, left, right, hash = undefined) {
    super(hash)
    this.item = item
    this.left = left
    this.right = right
  }

  toString() {
    const extent = (this.left !== undefined && this.right !== undefined) ?
      `, ${this.left}, ${this.right}` : ''
    return `('${this.item.value}'${extent})`
  }

  dotStyle() {
    return `shape="box" style="rounded"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.item, this.left, this.right, this.hash))
  }
}
Serializable.registerSubclass(SPPF.TerminalNode)

SPPF.EpsilonNode = class SPPFEpsilonNode extends SPPF.TerminalNode {
  constructor() {
    super(EPSILON, 0, 0)
  }

  toString() {
    return '(Ɛ, 0, 0)'
  }
}
Serializable.registerSubclass(SPPF.EpsilonNode)

SPPF.treeCount = (root) => {
  const countInner = (node, seen = []) => {
    if (fast.indexOf(seen, node) >= 0) {
      return 1
    }

    seen.push(node)

    if (packedKids(node)) {
      return fast.reduce(
        node.arcs,
        (count, arc) => count + countInner(arc, seen),
        0
      )
    } else if (node.arcs.length === 0) {
      return 1
    } else {
      return fast.reduce(
        node.arcs,
        (count, arc) => count * countInner(arc, seen),
        1
      )
    }
  }

  return countInner(root)
}

SPPF.Forest = class SPPFForest extends Serializable {
  constructor(root) {
    super()
    this.root = root
    if (this.transform()) {
      throw new Error(`Recognition failed (empty forest after transforms)`)
    }
  }

  transform(transforms = [], dropDefault = false) {
    const dead = this.root.transform(dropDefault ? transforms : [
      (node) => {
        node.arcs = fast.filter(node.arcs, packed => {
          const packedArcs = packed.flattenArcs()
          const operatorIndex =
            fast.findIndex(packedArcs, arc => arc.asOperator() !== null)

          if (operatorIndex === undefined){
            return true
          }

          const operator = packedArcs[operatorIndex].asOperator()

          let child = (() => {
            switch (operator.assoc) {
              case 'left': {
                return packedArcs[operatorIndex + 1]
              } break
              case 'right': {
                return packedArcs[operatorIndex - 1]
              } break
              default:
                return null
            }
          })()

          if (child === null) {
            return true
          } else {
            const checkChildArcs = (arcs) => {
              const childOperatorIndex =
                fast.findIndex(arcs, arc => arc.asOperator() !== null)

              if (childOperatorIndex === undefined) {
                return true
              }

              const childOperator = arcs[childOperatorIndex].asOperator()

              if (childOperator.precedence === operator.precedence) {
                return false
              } else {
                return true
              }
            }

            if (child.hasPacked()) {
              return fast.reduce(
                child.flattenArcs(),
                (acc, grandchild) => acc && checkChildArcs(
                  grandchild.flattenArcs()
                ),
                true
              )
            } else {
              return checkChildArcs(child.flattenArcs())
            }
          }
        })
      }
      , (node) => {
        node.arcs = node.arcs.filter(packed => {
          const packedArcs = packed.flattenArcs()
          const operatorIndex =
            fast.findIndex(packedArcs, arc => arc.asOperator() !== null)

          if (operatorIndex === undefined){
            return true
          }

          const operator = packedArcs[operatorIndex].asOperator()

          return fast.reduce(packedArcs, (acc, child) => {
            if (!acc) {
              return false
            }

            if (child.item !== node.item) {
              return true
            }

            const checkChildArcs = (arcs) => {
              const childOperatorIndex =
                fast.findIndex(arcs, arc => arc.asOperator() !== null)

              if (childOperatorIndex === undefined) {
                return true
              }

              const childOperator = arcs[childOperatorIndex].asOperator()

              if (childOperator.precedence > operator.precedence) {
                return false
              } else {
                return true
              }
            }

            if (child.hasPacked()) {
              return fast.reduce(
                child.flattenArcs(),
                (acc, grandchild) => acc && checkChildArcs(
                  grandchild.flattenArcs()
                ),
                true
              )
            }

            return checkChildArcs(child.flattenArcs())
          }, true)
        })
      }
    ].concat(transforms))
  }

  get trees() {
    if (this.TREES === undefined) {
      this.TREES = generateParseTrees(this.root)
    }

    return this.TREES
  }
}
Serializable.registerSubclass(SPPF.Forest)

module.exports = SPPF
