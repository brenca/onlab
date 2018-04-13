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

const obj = (key, value) => {
  let object = {}
  object[key] = value
  return object
}

const generateObjectPermutations = (list) => {
  if (list.length === 0) return [{ }]
  if (list.length === 1) return list[0]

  const next = generateObjectPermutations(list.slice(1))
  return [].concat.apply([], list[0].fastMap(element => {
    return next.fastMap(n => {
      return Object.assign({}, n, element)
    })
  }))
}

const generateDecisions = (root) => {
  const traverse = (node, seen = []) => {
    if (seen.indexOf(node) >= 0) return [{}]
    seen = seen.concat(node)

    if (!hasPacked(node)) return [{}]

    if (packedKids(node)) {
      const r = node.arcs.fastMap((arc, i) => {
        if (!hasPacked(arc)) {
          return obj(node.hash, i)
        } else {
          let results = traverse(arc, seen).fastMap(result => {
            result[node.hash] = i
            return result
          })
          return results
        }
      })

      return [].concat.apply([], r)
    } else {
      const r = node.arcs.fastMap(arc => traverse(arc, seen))

      return generateObjectPermutations(r)
    }
  }

  return traverse(root.clone())
}

const generateParseTrees = (root) => {
  const decisions = generateDecisions(root)
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

    const dead = transform(forest, [
      (node) => {
        node.arcs = node.arcs.filter(packed => {
          const operatorIndex = packed.arcs.findIndex(
            arc => arc.asOperator() !== null)
          if (operatorIndex === -1)
            return true
          const operator = packed.arcs[operatorIndex].asOperator()

          let child = (() => {
            switch (operator.assoc) {
              case 'left': {
                return packed.arcs[operatorIndex + 1]
              } break
              case 'right': {
                return packed.arcs[operatorIndex - 1]
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
              return child.arcs.reduce((acc, grandchild) => {
                return acc && checkChildArcs(grandchild.arcs)
              }, true)
            } else {
              return checkChildArcs(child.arcs)
            }
          }
        })
      }
      , (node) => {
        node.arcs = node.arcs.filter(packed => {
          const operatorIndex = packed.arcs.findIndex(
            arc => arc.asOperator() !== null)
          if (operatorIndex === -1)
            return true
          const operator = packed.arcs[operatorIndex].asOperator()

          return packed.arcs.reduce((acc, child) => {
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
              return child.arcs.reduce((acc, grandchild) => {
                return acc && checkChildArcs(grandchild.arcs)
              }, true)
            }

            return checkChildArcs(child.arcs)
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
