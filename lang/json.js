const Language = require('../lib/language')
const fs = require('fs')
const { Lexer, Parser } = Language

class JSONLang extends Language {
  constructor() {
    super()
  }

  static fromBNF() {
    const json = new JSONLang()

    json.lexer.addTokenClasses([
      new Lexer.TokenClass('integer', /[-]?([0-9]|[1-9][0-9]*)(?!\w)/iu),
      new Lexer.TokenClass('fraction', /\.[0-9]+/iu),
      new Lexer.TokenClass('exponent', /(?=\b)e[+-]?[0-9]+(?!\w)/iu),
      new Lexer.TokenClass('true', /(?=\b)true(?!\w)/iu),
      new Lexer.TokenClass('false', /(?=\b)false(?!\w)/iu),
      new Lexer.TokenClass('null', /(?=\b)null(?!\w)/iu),
      new Lexer.TokenClass('escaped', /\\["\\\/bnrt]/iu),
      new Lexer.TokenClass('unicode', /\\u[0-9]{4}/iu),
      new Lexer.TokenClass('string', /"(?:[^"\\]|\\.)*"/iu),
      new Lexer.TokenClass('char', /\S/iu)
    ])

    json.parser.setupFromBNF(`
      <JSON> ::= <Object> | <Array>
      <Object> ::= "{" "}" | "{" <Members> "}"
      <Members> ::= <Pair> | <Pair> "," <Members>
      <Pair> ::= <String> ":" <Value>
      <Array> ::= "[" "]" | "[" <Elements> "]"
      <Elements> ::= <Value> | <Value> "," <Elements>
      <Value> ::= <String>
                | <Number>
                | <Object>
                | <Array>
                | <Token-true>
                | <Token-false>
                | <Token-null>
      <String> ::= <Token-string>
      <Number> ::= <Token-integer>
                 | <Token-integer> <Token-fraction>
                 | <Token-integer> <Token-exponent>
                 | <Token-integer> <Token-fraction> <Token-exponent>
    `)

    fs.writeFile('json.json', json.save(), 'utf8', () => {})

    return json
  }

  static fromSave() {
    const json = new JSONLang()
    json.load(fs.readFileSync('json.json', 'utf8'))
    return json
  }

  execute(code) {
    try {
      let sppf = this.buildSPPF(code)
      console.log('recognized');
      const trees = sppf.trees

      const toString = (node, seen = {}) => {
        seen[node.hash] = true

        if (node.item && node.item.value !== undefined) {
          return node.item.value.length > 0 ?
            node.item.value : 'Ɛ'
        } else {
          const str = node.arcs.map((arc, i) => {
            if (seen[arc]) {
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
        // console.log(`${code} | ${toString(tree)}`);
        // const result = exec(tree)
        // console.log(`Result: ${result}`)
        // console.log('=================================================')
      })
    } catch (e) {
      console.log(e)
    }
  }
}

module.exports = JSONLang
