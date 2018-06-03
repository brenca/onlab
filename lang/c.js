const Language = require('../lib/language')
const EventEmitter = require('events')
const fs = require('fs')
const { Lexer, Parser } = Language

class CLang extends Language {
  constructor() {
    super()
  }

  static fromBNF() {
    const c = new CLang()

    c.lexer.addTokenClasses([
      new Lexer.TokenClass('and', /&&(?!\w)/iu),
      new Lexer.TokenClass('or', /\|\|(?!\w)/iu),
      new Lexer.TokenClass('lte', /<=(?!\w)/iu),
      new Lexer.TokenClass('gte', />=(?!\w)/iu),
      new Lexer.TokenClass('eq', /==(?!\w)/iu),
      new Lexer.TokenClass('ne', /!=(?!\w)/iu),
      new Lexer.TokenClass('float', /(?=\d)\d+\.\d+(?!\w)/iu),
      new Lexer.TokenClass('integer', /(?=\d)\d+(?!\w)/iu),
      new Lexer.TokenClass('identifier', /(?=[a-z_])[a-z0-9_]*(?!\w)/iu),
      new Lexer.TokenClass('char', /\S/iu)
    ])

    c.parser.setupFromBNF(`
      <Program> ::= <Program> <Stuff> | <Stuff>
      <Stuff> ::= <Function-call> | <Boolean> | <Math> | <Identifier>

      <Identifier> ::= <Token-identifier>

      <Function-call> ::= <Identifier> "(" <Parameter-list> ")"

      <Parameter-list> ::= <Parameter> <Parameter-list> | ""
      <Parameter> ::= <Identifier> | <Boolean> | <Math> | <Function-call>

      <Boolean> ::= <Boolean> <bool-in-op> <Boolean>
                  | <bool-pre-op> <Boolean>
                  | "(" <Boolean> ")"
                  | <Boolean-literal>
      <bool-pre-op> ::= "!" +0+ =left=
      <bool-in-op> ::= <Token-lte> +66+ =left=
                     | <Token-gte> +66+ =left=
                     | <Token-eq> +66+ =left=
                     | <Token-ne> +66+ =left=
                     | "<" +66+ =left=
                     | ">" +66+ =left=
                     | <Token-and> +65+ =left=
                     | <Token-or> +65+ =left=
      <Boolean-literal> ::= "true" | "false" | <Math>

      <Math> ::= <Math> <math-in-op> <Math>
               | <math-pre-op> <Math>
               | "(" <Math> ")"
               | <Math-literal>
      <math-pre-op> ::= "+" +1+ =left=
                      | "-" +1+ =left=
      <math-in-op> ::= "+" +56+ =left=
                     | "-" +56+ =left=
                     | "*" +55+ =left=
                     | "/" +55+ =left=
                     | "^" +54+ =right=
      <Math-literal> ::= <Token-integer> | <Token-float>
    `)

    fs.writeFile('c.json', c.save(), 'utf8', () => {})

    return c
  }

  static fromSave() {
    const c = new CLang()
    c.load(fs.readFileSync('c.json', 'utf8'))
    return c
  }

  execute(code) {
    try {
      let sppf = this.buildSPPF(code)

      sppf.transform([(node) => {
        if (node.item.name === 'Parameter') {
          node.arcs = node.arcs.filter(packed => {
            const packedArcs = packed.flattenArcs()
            if (packedArcs[0].item.name === 'Boolean') {
              return false
            }

            return true
          })
        }

        return false
      }], true)

      const trees = sppf.trees

      const toString = (node, seen = []) => {
        seen = seen.concat(node)

        if (node.item && node.item.value !== undefined) {
          return node.item.value.length > 0 ?
            node.item.value : 'Ɛ'
        } else {
          const str = node.arcs.map((arc, i) => {
            if (seen.indexOf(arc) >= 0) {
              return ``
            } else {
              return toString(arc, seen)
            }
          }).join('')

          if (node instanceof Parser.SPPF.IntermediateNode)
            return str
          return node.arcs.length > 1 ? `(${str})` : str
        }
      }

      const exec = (node) => {
        const resolve = (arcs) => {
          return arcs.map(arc => {
            if (arc instanceof Parser.SPPF.IntermediateNode) {
              return resolve(arc.arcs)
            } else {
              return arc
            }
          }).reduce((a, x) => a.concat(x), [])
        }
        const args = resolve(node.arcs).map(exec)

        if (node.item.class) {
          return node.item.value
        }

        switch (node.item.name) {
          case 'Program': {
            switch (node.action.i) {
              case 0: {
                return `${args[0]}, ${args[1]}`
              } break
              case 1: {
                return args[0]
              } break
            }
          } break
          case 'Parameter-list': {
            switch (node.action.i) {
              case 0: {
                return `${args[0]}, ${args[1]}`
              } break
              case 1: {
                return ''
              } break
            }
          } break
          case 'Parameter': {
            return args[0]
          } break
          case 'Function-call': {
            return `${args[0]}(${args[2]})`
          } break
          case 'Stuff': {
            return args[0]
          } break
          case 'Identifier': {
            return args[0]
          } break
          case 'Boolean': {
            switch (node.action.i) {
              case 0: {
                switch (args[1]) {
                  case '<=': {
                    return args[0] <= args[2]
                  } break
                  case '>=': {
                    return args[0] >= args[2]
                  } break
                  case '==': {
                    return args[0] == args[2]
                  } break
                  case '!=': {
                    return args[0] != args[2]
                  } break
                  case '<': {
                    return args[0] < args[2]
                  } break
                  case '>': {
                    return args[0] > args[2]
                  } break
                  case '&&': {
                    return args[0] && args[2]
                  } break
                  case '||': {
                    return args[0] || args[2]
                  } break
                }
              } break
              case 1: {
                switch (args[0]) {
                  case '!': {
                    return !args[1]
                  } break
                }
              } break
              case 2: {
                return args[1]
              } break
              case 3: {
                return args[0]
              } break
            }
          } break
          case 'bool-pre-op': {
            return args[0].toString()
          } break
          case 'bool-in-op': {
            return args[0].toString()
          } break
          case 'Boolean-literal': {
            switch (node.action.i) {
              case 0: {
                return true
              } break
              case 1: {
                return false
              } break
              case 2: {
                return args[0]
              } break
            }
          } break
          case 'Math': {
            switch (node.action.i) {
              case 0: {
                switch (args[1]) {
                  case '+': {
                    return args[0] + args[2]
                  } break
                  case '-': {
                    return args[0] - args[2]
                  } break
                  case '*': {
                    return args[0] * args[2]
                  } break
                  case '/': {
                    return args[0] / args[2]
                  } break
                  case '^': {
                    return Math.pow(args[0], args[2])
                  } break
                }
              } break
              case 1: {
                switch (args[0]) {
                  case '-': {
                    return -args[1]
                  } break
                  case '+': {
                    return args[1]
                  } break
                }
              } break
              case 2: {
                return args[1]
              } break
              case 3: {
                return args[0]
              } break
            }
          } break
          case 'math-pre-op': {
            return args[0]
          } break
          case 'math-in-op': {
            return args[0]
          } break
          case 'Math-literal': {
            switch (node.action.i) {
              case 0: {
                return parseInt(args[0])
              } break
              case 1: {
                return parseFloat(args[0])
              } break
            }
          } break
        }
      }

      trees.forEach(tree => {
        console.log(`${code} | ${toString(tree)}`);
        const result = exec(tree)
        console.log(`Result: ${result}`)
        console.log('=================================================')
      })
    } catch (e) {
      console.log(e)
    }
  }
}

module.exports = CLang
