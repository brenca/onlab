const Lexer = require('./lexer')
const Parser = require('./parser')
Array.prototype = require('./array')

const packedKids = (node) => {
  return node.arcs.length > 0 &&
         node.arcs[0] instanceof Parser._SPPFPackedNode
}

const hasOrIsPacked = (node, seen = []) => {
  if (seen.indexOf(node) >= 0) return false
  seen = seen.concat(node)

  if (node instanceof Parser._SPPFPackedNode) return true

  return hasPacked(node, seen)
}

const hasPacked = (node, seen = []) => {
  return node.arcs.reduce((acc, arc) => {
    return acc || hasOrIsPacked(arc, seen)
  }, false)
}

// const reduce = (node, seen = []) => {
//   if (seen.indexOf(node) >= 0) return
//   seen = seen.concat(node)
//
//   node.arcs = node.arcs.fastMap(arc => {
//     if (arc.arcs.length === 1 && arc.arcs[0].item.name === undefined)
//       return arc.arcs[0]
//     return arc
//   })
//
//   node.arcs.fastForEach(arc => reduce(arc, seen))
// }

const transform = (node, actions, dead = false, seen = []) => {
  if (seen.indexOf(node) >= 0) return
  seen = seen.concat(node)

  if (packedKids(node)) {
    actions.fastForEach(action => action(node))
    if (node.arcs.length === 0) {
      dead = true
    }
  }

  node.arcs.fastForEach(arc => transform(arc, actions, dead, seen))
  return dead
}

const getDecisions = root => {
  const packed = node => node instanceof Parser._SPPFPackedNode
  const merge = decs => {
    const ret = {}
    decs.forEach(dec => {
      Object.keys(dec).forEach(hash => {
        ret[hash] = (ret[hash] || []).concat(dec[hash])
      })
    })
    return ret
  }

  const combine = arrays => {
    if (arrays.length === 0) {
      return []
    } else {
      let result = arrays[0].map(x => [x])
      for (let i = 1; i < arrays.length; i++) {
        result = result.map(r => arrays[i].map(x => r.concat(x)))
          .reduce((a, x) => a.concat(x), [])
      }
      return result
    }
  }

  const diff = (dec1, dec2) => {
    const d = {}
    Object.keys(dec2).forEach(key => {
      if (!dec1[key]) {
        d[key] = dec2[key].slice()
      } else if (dec1[key].length < dec2[key].length) {
        d[key] = dec2[key].slice(dec1[key].length)
      }
    })
    return d
  }

  const generateDecisions = (node, decisions = [{}]) => {
    if (node.arcs.length === 0) {
      return decisions
    } else if (node.arcs.some(arc => !packed(arc))) {
      return decisions.map(decs => {
        return combine([
          [decs],
          combine(node.arcs.map(arc => generateDecisions(arc, [decs])
            .map(gd => diff(decs, gd))))
        ]).map(decs => merge(decs))
      }).reduce((a, x) => a.concat(x), [])
    } else {
      return decisions.map(decs => {
        if (decs[node.hash] === undefined) decs[node.hash] = []
        return node.arcs
          .filter(arc => decs[node.hash].indexOf(arc.hash) < 0)
          .map(arc => {
            const arcHash = {}
            arcHash[node.hash] = [arc.hash]
            return generateDecisions(arc, [merge([decs, arcHash])])
          }).reduce((a, x) => a.concat(x), [])
      }).reduce((a, x) => a.concat(x), [])
    }
  }

  return generateDecisions(root)
}

const generateParseTrees = (root) => {
  const decisions = getDecisions(root)
  return decisions.fastMap(decision => {
    return root.clone(decision)
  })
}

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
    let tokenized = this._lexer.tokenize(code)
    if (!tokenized.success) throw Error('could not tokenize code')
    const forest = this._parser.parse(tokenized.tokens)

    if (!forest) {
      throw new Error(`Recognition failed (empty forest)`)
    }

    const flatten = (arcs) => {
      return arcs.map(arc => {
        if (arc instanceof Parser._SPPFIntermediateNode) {
          return flatten(arc.arcs)
        }

        return arc
      }).reduce((a, x) => a.concat(x), [])
    }

    const dead = transform(forest, [
      (node) => {
        node.arcs = node.arcs.filter(packed => {
          const packedArcs = flatten(packed.arcs)
          const operatorIndex = packedArcs.findIndex(
            arc => arc.asOperator() !== null)
          if (operatorIndex === -1)
            return true
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
              const childOperatorIndex = arcs.findIndex(
                arc => arc.asOperator() !== null)
              if (childOperatorIndex === -1) {
                return true
              }

              const childOperator = arcs[childOperatorIndex].asOperator()

              if (childOperator.precedence === operator.precedence) {
                return false
              } else {
                return true
              }
            }

            if (hasPacked(child)) {
              return flatten(child.arcs).reduce((acc, grandchild) => {
                return acc && checkChildArcs(flatten(grandchild.arcs))
              }, true)
            } else {
              return checkChildArcs(flatten(child.arcs))
            }
          }
        })
      }
      , (node) => {
        node.arcs = node.arcs.filter(packed => {
          const packedArcs = flatten(packed.arcs)
          const operatorIndex = packedArcs.findIndex(
            arc => arc.asOperator() !== null)
          if (operatorIndex === -1)
            return true
          const operator = packedArcs[operatorIndex].asOperator()

          return packedArcs.reduce((acc, child) => {
            if (!acc) return false
            if (child.item !== node.item) return true

            const checkChildArcs = (arcs) => {
              const childOperatorIndex = arcs.findIndex(
                arc => arc.asOperator() !== null)
              if (childOperatorIndex === -1) {
                return true
              }

              const childOperator = arcs[childOperatorIndex].asOperator()

              if (childOperator.precedence > operator.precedence) {
                return false
              } else {
                return true
              }
            }

            if (hasPacked(child)) {
              return flatten(child.arcs).reduce((acc, grandchild) => {
                return acc && checkChildArcs(flatten(grandchild.arcs))
              }, true)
            }

            return checkChildArcs(flatten(child.arcs))
          }, true)
        })
      }
      // , (node) => {
      //   node.arcs = node.arcs.filter(packed => {
      //     return !packed.arcs.reduce((acc, arc) => {
      //       return acc && arc.item.nullable
      //     }, true)
      //   })
      // }
    ])

    if (dead) {
      throw new Error(`Recognition failed (empty forest after transforms)`)
    }

    return new Language.SPPF(forest)
  }
}

Language.SPPF = class {
  constructor(root) {
    this.root = root
    this.trees_ = generateParseTrees(this.root)
  }

  treeCount(node = undefined) {
    const countInner = (node, seen = []) => {
      if (seen.indexOf(node) >= 0) return 1
      seen = seen.concat(node)

      if (packedKids(node)) {
        return node.arcs.reduce((acc, arc) => {
          return acc + countInner(arc, seen)
        }, 0)
      } else if (node.arcs.length === 0) {
        return 1
      } else {
        return node.arcs.reduce((acc, arc) => {
          return acc * countInner(arc, seen)
        }, 1)
      }
    }

    return countInner(node || this.root)
  }

  get trees() {
    return this.trees_
  }
}

Language.Lexer = Lexer
Language.Parser = Parser

module.exports = Language
