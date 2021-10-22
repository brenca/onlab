const uuid = require('uuid/v4')
const fast = require('./faster')
const { Serializable, SerializableLookupSet } = require('./serializable')

const BNF = require('./bnf.js')

const EPSILON = new BNF.Terminal('')
const SPPF = { }

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
    } else if (node.arcs.some(arc => !packed(arc))) {
      return fast.reduce(fast.map(decisions, decs => {
        return fast.map(combine([
          [decs],
          combine(
            node.arcs.map(
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

        return fast.reduce(fast.map(node.arcs.filter(
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

const flattenArcs = (arcs) => {
  return fast.reduce(arcs.map(arc => {
    if (arc instanceof SPPF.IntermediateNode) {
      return arc.flattenArcs()
    }

    return arc
  }), (a, x) => fast.concat(a, x), [])
}

SPPF.Node = class SPPFNode extends Serializable {
  constructor(hash = undefined) {
    super()
    this.arcs = new SerializableLookupSet()
    this.hash = hash ? hash : uuid()
  }

  serialize() {
    return {
      arcs: this.arcs,
      hash: this.hash
    }
  }

  deserialize(object) {
    this.arcs = object.$data.arcs
    this.hash = object.$data.hash
  }

  get ruleName() {
    return undefined
  }

  packs(other) {
    const alfa = flattenArcs(other)
    const beta = this.flattenArcs()

    return alfa.length === beta.length &&
      fast.reduce(alfa, (a, x, i) => a && x.equals(beta[i]), true)
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
        , arc => arc.hash === hash).arcs
        , arc => arc.clone(decisions))
    } else {
      other.arcs = this.arcs.map(arc => arc.clone(decisions))
    }

    return other
  }

  hasOrIsPacked(seen = {}) {
    if (seen[this.hash]) {
      return false
    }

    seen[this.hash] = true

    return this instanceof SPPF.PackedNode ? true : this.hasPacked(seen)
  }

  hasPacked(seen = {}) {
    return this.arcs.reduce(
      (isPacked, arc) => isPacked || arc.hasOrIsPacked(seen),
      false
    )
  }

  packedKids() {
    return this.arcs.length > 0 && this.arcs[0] instanceof SPPF.PackedNode
  }

  transform(actions, dead = false, seen = {}) {
    if (seen[this.hash]) {
      return dead
    }

    seen[this.hash] = true

    const isDead = this.arcs.reduce(
      (isDead, arc) => {
        if (!arc) return isDead
        return isDead || arc.transform(actions, dead, seen)
      },
      false
    )

    if (this.packedKids()) {
      fast.forEach(actions, action => action(this))
      if (this.arcs.length === 0) { // do we need this?
        return true
      }
    }

    return isDead
  }

  traverse(action, seen = {}) {
    if (!seen[this.hash]) {
      seen[this.hash] = true

      action(this)

      this.arcs.forEach(arc => arc.traverse(action, seen))
    }
  }

  flattenRNPs(seen = {}) {
    if (!seen[this.hash]) {
      seen[this.hash] = true

      this.arcs = fast.reduce(this.arcs.map(arc => {
        arc.flattenRNPs(seen)
        return arc instanceof SPPF.RightNullablePartNode ? arc.arcs : arc
      }), (a, x) => a.concat(x), [])
    }
  }

  flattenArcs() {
    return flattenArcs(this.arcs)
  }

  getDirectDescendants(seen = {}) {
    if (seen[this.SID]) {
      return []
    }

    seen[this.SID] = true

    const arcs = this.flattenArcs()
    if (arcs.length === 1) {
      return [arcs[0]].concat(arcs[0].getDirectDescendants(seen))
    } else {
      return []
    }
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

  serialize() {
    return {
      arcs: this.arcs,
      hash: this.hash,
      action: this.action,
      alfa: this.alfa,
      left: this.left,
      right: this.right
    }
  }

  deserialize(object) {
    this.arcs = object.$data.arcs
    this.hash = object.$data.hash
    this.action = object.$data.action
    this.alfa = object.$data.alfa
    this.left = object.$data.left
    this.right = object.$data.right
  }

  get ruleName() {
    return this.action.rule.name
  }

  toString() {
    const rule = `'${this.action.rule.name}' ::= ${
      fast.map(this.action.rule.subrules[this.action.i], (rule, i) => {
        return `${(rule.printable() || `'Ɛ'`)}` + (i === this.alfa ?
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

  serialize() {
    return {
      arcs: this.arcs,
      hash: this.hash,
      action: this.action
    }
  }

  deserialize(object) {
    this.arcs = object.$data.arcs
    this.hash = object.$data.hash
    this.action = object.$data.action
  }

  get ruleName() {
    return this.action.rule.name
  }

  toString() {
    const rule = `${this.action.rule.name} ::= ${
      fast.map(this.action.rule.subrules[this.action.i], (rule, i) => {
        return (rule.printable() || `'Ɛ'`) + (i + 1 === this.action.dot ?
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

  serialize() {
    return {
      arcs: this.arcs,
      hash: this.hash,
      action: this.action,
      left: this.left,
      right: this.right
    }
  }

  deserialize(object) {
    this.arcs = object.$data.arcs
    this.hash = object.$data.hash
    this.action = object.$data.action
    this.left = object.$data.left
    this.right = object.$data.right
  }

  get ruleName() {
    return this.action.rule.name
  }

  asOperator() {
    if (this.action.i === null)
      return null

    const subrules = this.action.rule.subrules[this.action.i]
    if (subrules.length === 1 && subrules[0].isOperator()) {
      return subrules[0]
    }

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

  serialize() {
    return {
      arcs: this.arcs,
      hash: this.hash,
      rules: this.rules
    }
  }

  deserialize(object) {
    this.arcs = object.$data.arcs
    this.hash = object.$data.hash
    this.rules = object.$data.rules
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

  serialize() {
    return {
      arcs: this.arcs,
      hash: this.hash,
      item: this.item,
      left: this.left,
      right: this.right
    }
  }

  deserialize(object) {
    this.arcs = object.$data.arcs
    this.hash = object.$data.hash
    this.item = object.$data.item
    this.left = object.$data.left
    this.right = object.$data.right
  }

  get ruleName() {
    return this.item.class.name
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
  const countInner = (node, seen = {}) => {
    if (seen[node.hash]) {
      return 1
    }

    seen[node.hash] = true

    if (node.packedKids()) {
      return node.arcs.reduce(
        (count, arc) => count + countInner(arc, seen),
        0
      )
    } else if (node.arcs.length === 0) {
      return 1
    } else {
      return node.arcs.reduce(
        (count, arc) => count * countInner(arc, seen),
        1
      )
    }
  }

  return countInner(root)
}

SPPF.Forest = class SPPFForest extends Serializable {
  // Assume the worst
  constructor(root, ambiguous = true) {
    super()
    this.root = root
    this.ambiguous = ambiguous

    if (root) {
      console.log('transforming')

      this.root.flattenRNPs()
      if (this.transform()) {
        throw new Error(`Recognition failed (empty forest after transforms)`)
      }
    }
  }

  serialize() {
    return {
      root: this.root,
      ambiguous: this.ambiguous,
      trees: this.TREES
    }
  }

  deserialize(object) {
    this.root = object.$data.root
    this.ambiguous = object.$data.ambiguous
    this.TREES = object.$data.trees
  }

  transform(transforms = [], dropDefault = false) {
    const skip = dropDefault || this.ambiguous === false
    const transformList = skip ? transforms : [
      (node) => {
        const paths = { }
        const keepMe = new Set()

        node.arcs.forEach(arc => {
          paths[arc.SID] = arc.arcs.map(arc =>
            fast.reduce(
              arc.getDirectDescendants(),
              (acc, arc) => fast.concat([arc.SID], acc),
              [arc.SID]
            )
          )

          const keep = fast.reduce([...keepMe], (res, item) => {
            if (!res) return res

            if (paths[item].length === paths[arc.SID].length) {
              return fast.reduce(paths[item], (keep, a, i) => {
                if (!keep) return keep

                const b = paths[arc.SID][i]
                if (a[0] === b[0]) {
                  if (a.length === b.length) {
                    return fast.reduce(a, (a, x, i) => {
                      return a && x === b[i]
                    }, true)
                  } else if (a.length < b.length) {
                    return false
                  } else {
                    keepMe.delete(item)
                    return true
                  }
                } else {
                  return true
                }
              }, true)
            } else {
              return true
            }
          }, true)

          if (keep) {
            keepMe.add(arc.SID)
          }
        })

        node.arcs = node.arcs.filter(arc => keepMe.has(arc.SID))
      }, (node) => {
        if (node.arcs.length === 1) {
          node.arcs = node.arcs[0].arcs
        }
      }, (node) => {
        node.arcs.forEach(arc => { arc.parent = node })
      }
    ].concat(transforms)

    return transformList.length > 0 ? this.root.transform(transformList) : false
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
