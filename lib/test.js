const Language = require('../lib/language')
const EventEmitter = require('events')
const { Lexer, Parser } = Language

const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'
const spec = '\\\\.,\\/#!$%@&<>\\^\\*;:{}=\\-\\+_`~()\'"'

const createDOTGraph = (root, filename = `test`) => {
  const uuid = require('uuid/v4')
  const fs = require('fs')
  const util = require('util')

  const label = (node, list, level = 0, seen = []) => {
    seen = seen.concat(node)
    node.uuid = uuid()
    node.level = level
    list.push(node)


    let max = level
    node.arcs.forEach(arc => {
      if (seen.indexOf(arc) === -1) {
        let l = label(arc, list, level + 1, seen)
        if (l > max) {
          max = l
        }
      }
    })

    return max
  }

  const graphFile = fs.createWriteStream(`${filename}.dot`, { flags: 'w' })
  const writeLog = function(d) {
    const stuff = d ? util.format(d) : ''
    graphFile.write(stuff + '\n')
  }

  let nodes = []
  let maxLevel = label(root, nodes)
  nodes = [...new Set(nodes)]

  writeLog('digraph g {')
  nodes.forEach(node => {
    writeLog(`"${node.uuid}" [label=<${node.toString()}<BR /><FONT POINT-SIZE="10">${node.hash.slice(0, 10)}</FONT>>  ${node.dotStyle()}]`)
  })
  nodes.forEach(node => {
    node.arcs.forEach((arc, i) => {
      writeLog(`"${node.uuid}" -> "${arc.uuid}" [label="${i}"]`)
    })
  })

  const otherNodes = nodes.filter(node =>
    !(node instanceof Parser._SPPFTerminalNode))
  for (let i = 0; i < maxLevel; i++) {
    writeLog(`{rank = same; ${otherNodes.filter(node => {
      return node.level === i
    }).map(node => `"${node.uuid}"`).join('; ')}}`)
  }

  writeLog(`{rank = same; ${nodes.filter(node => {
    return node instanceof Parser._SPPFTerminalNode
  }).map(node => `"${node.uuid}"`).join('; ')}}`)
  writeLog('}')

  graphFile.end()
}

class Test extends Language {
  constructor(handler) {
    super()

    this.lexer.addTokenClasses([
      // new Lexer.TokenClass('comment', /\/\/.*(?=\r?\n|$)/iu),
      // new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.[0-9]+)/),
      // new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      // new Lexer.TokenClass('bool', /(?:\b)(true|false)(?!\w)/iu),
      // new Lexer.TokenClass('not', /(?:\b)not(?!\w)/iu),
      // new Lexer.TokenClass('and', /(?:\b)and(?!\w)/iu),
      // new Lexer.TokenClass('or', /(?:\b)or(?!\w)/iu),
      // new Lexer.TokenClass('draw-cmd', /(?:\b)(fd|forward|bk|backward|rt|right|lt|left)(?!\w)/iu),
      // new Lexer.TokenClass('objparam-cmd', /(?:\b)(firstput|lastput|item|member\?)(?!\w)/iu),
      // new Lexer.TokenClass('strparam-cmd', /(?:\b)(make|local)(?!\w)/iu),
      // new Lexer.TokenClass('general-cmd', /(?:\b)(list\?|number\?|word\?|output|thing|setpencolor|setpenwidth|setpen|setpc|towards)(?!\w)/iu),
      // new Lexer.TokenClass('moreparam-cmd', /(?:\b)(print)(?!\w)/iu),
      // new Lexer.TokenClass('twoormoreparam-cmd', /(?:\b)(list|word|sentence)(?!\w)/iu),
      // new Lexer.TokenClass('list-cmd', /(?:\b)(first|last|butfirst|butlast|uppercase|lowercase|count|empty\?|run|setposition)(?!\w)/iu),
      // new Lexer.TokenClass('math-cmd', /(?:\b)(abs|sin|cos|tan|arcsin|arccos|arctan|exp|integer|int|log10|log|random|round|sqrt|wait|setx|sety|setheading)(?!\w)/iu),
      // new Lexer.TokenClass('twomath-cmd', /(?:\b)(power|pow)(?!\w)/iu),
      // new Lexer.TokenClass('if-cmd', /(?:\b)if(?!\w)/iu),
      // new Lexer.TokenClass('for-cmd', /(?:\b)(for|repeat)(?!\w)/iu),
      // new Lexer.TokenClass('to-cmd', /(?:\b)to(?!\w)/iu),
      // new Lexer.TokenClass('end', /(?:\b)end(?!\w)/iu),
      // new Lexer.TokenClass('noparam-cmd', /(?:\b)(pi|date|time|stop|heading|hideturtle|showturtle|shown\?|position|xpos|ypos|home|clean|clearscreen|cs|pendown|pd|penup|pu|penwidth|pencolor|pc|pen|e)(?!\w)/iu),
      // new Lexer.TokenClass('word', new RegExp('"[a-z' + acc + spec + '0-9]*', 'iu')),
      // new Lexer.TokenClass('var', new RegExp(':[a-z' + acc + '0-9]+', 'iu')),
      // new Lexer.TokenClass('literal', new RegExp('[a-z' + acc + '0-9]+', 'iu')),
      new Lexer.TokenClass('char', /\S/iu)
    ])

    // this.parser.fromBNF(`
    //   <S> ::= "a" <S> <A> | ""
    //   <A> ::= ""
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= <A> <B> <C> <D>
    //   <A> ::= "a"
    //   <B> ::= "b"
    //   <C> ::= "c"
    //   <D> ::= "d"
    // `)

    this.parser.setupFromBNF(`
      <S> ::= <S> <S> | "a" | ""
    `)

    // this.parser.fromBNF(`
    //   <S> ::= <A> <B> "a"
    //   <A> ::= "b" | ""
    //   <B> ::= <A> "b" <C> <C>
    //   <C> ::= "aa" | "a" | ""
    // `)

    // this.parser.fromBNF(`
    //   <E> ::= <E> "+" <E> | "1"
    // `)

    // this.parser.fromBNF(`
    //   <E> ::= <E> <P> <E> | "1"
    //   <P> ::= "+" =left=
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= "a" "b" <A> "a" | "a" <B> <A> "a" | "a" "b" "a"
    //   <A> ::= "a" | "a" <A>
    //   <B> ::= "b"
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= <A> "x"
    //   <A> ::= "x"
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= <B> | <A>
    //   <B> ::= "a" | ""
    //   <A> ::= "a" | ""
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= "x" | <B> <S> "bah" | <A> <S> "bah" | ""
    //   <B> ::= <A> <A>
    //   <A> ::= "x" | ""
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= "a" <B> <B> <C>
    //   <B> ::= "b" | ""
    //   <C> ::= ""
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= "b" <B> <S> <S> | "a" | ""
    //   <B> ::= ""
    // `)

    // this.parser.fromBNF(`
    //   <E> ::= <E> <operator-2> <E> | <operator-1> <E> | "(" <E> ")" | <N>
    //   <operator-1> ::= "+" +0+ =left=
    //                  | "-" +0+ =left=
    //   <operator-2> ::= "+" +56+ =left=
    //                  | "-" +56+ =left=
    //                  | "*" +55+ =left=
    //                  | "/" +55+ =left=
    //                  | "^" +54+ =right=
    //   <N> ::= <num> | <num> "." <num>
    //   <num> ::= "0" | "1" | "2" | "3" | "4"
    //           | "5" | "6" | "7" | "8" | "9"
    //           | <num> <num>
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= <A> <S> "b" | "x"
    //   <A> ::= ""
    // `)

    // this.parser.fromBNF(`
    //   <S> ::= <A>
    //   <A> ::= <S> | "x"
    // `)

    // this.parser.fromBNF(
    //   `<Program> ::= <Program> <Expression> | ""
    //
    //   <Expression> ::= <GeneralCommand>
    //   <GeneralCommand> ::= <Token-general-cmd> <Parameter>
    //
    //   <Parameter> ::= <ValueExpression>
    //
    //   // Value expressions
    //   <ValueExpression> ::= <BoolOrMath>
    //   <BoolOrMath> ::= <Bool>
    //     | <Math>
    //
    //   // Math expressions
    //   <Math> ::= <MathTerm>
    //     | <MathTerm> "+" <Math>
    //     | <MathTerm> "-" <Math>
    //   <MathTerm> ::= <SignedMathLiteral>
    //     | <SignedMathLiteral> "*" <MathTerm>
    //     | <SignedMathLiteral> "/" <MathTerm>
    //     | <SignedMathLiteral> "%" <MathTerm>
    //   <SignedMathLiteral> ::= <MathLiteral>
    //     | "+" <MathLiteral>
    //     | "-" <MathLiteral>
    //   <MathLiteral> ::= <ValueExpression>
    //     | <Token-int>
    //     | <Token-float>
    //
    //   // Boolean expressions
    //   <Bool> ::= <BoolAND> <Token-or> <Bool>
    //     | <BoolAND>
    //   <BoolAND> ::= <BoolEQ> <Token-and> <BoolAND>
    //     | <BoolEQ>
    //   <BoolEQ> ::= <BoolCOMP> "==" <BoolEQ>
    //     | <BoolCOMP> "!=" <BoolEQ>
    //     | <BoolCOMP>
    //   <BoolCOMP> ::= <BoolNOT> "<" <BoolCOMP>
    //     | <BoolNOT> ">" <BoolCOMP>
    //     | <BoolNOT> "<=" <BoolCOMP>
    //     | <BoolNOT> ">=" <BoolCOMP>
    //     | <BoolNOT>
    //   <BoolNOT> ::= <Token-not> <BoolLiteral>
    //     | <BoolLiteral>
    //   <BoolLiteral> ::= <ValueExpression>
    //     | <Token-bool>
    //   `
    // )

    // this.parser.addDisambiguator('Math', node => {
    //   if (node.node.children.length === 1) {
    //     let child = node.node.children[0]
    //     while (child.children.length === 1 || (child.children.length === 2 && child.children[0].rule.name === 'Sign')) {
    //       child = child.children[child.children.length - 1]
    //       if (child.rule.name === 'Math' || child.rule.name === 'Bool') return true
    //     }
    //     // console.log(child.children);
    //     // console.log(node.node.children[0]);
    //   }
    // })

    // this.parser.fromBNF(
    //   `
    //   <P> ::= <P> <A> | ""
    //   <A> ::= <R> <B> <C> <C> <C> "d" | <R> <E> <C> <C> <C> "f" | <B> | <E>
    //   <R> ::= "r" <C>
    //   <B> ::= "x" "y"
    //   <E> ::= "x" "y"
    //   <C> ::= "" | <C> "c"
    //   <D> ::= <D> "c" | ""
    //   `
    // )
  }

  execute(code) {
    try {
      let sppf = this.buildSPPF(code)

      const trees = sppf.trees
      const treecount = sppf.treeCount()
      // console.log('=================================================')
      // console.log('Parse tree count matches expected:',
      //             trees.length === treecount, treecount)
      // console.log('=================================================')

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

          if (node instanceof Parser._SPPFIntermediateNode)
            return str
          return node.arcs.length > 1 ? `(${str})` : str
        }
      }

      // const dec = getDecisions(sppf.root)
      // dec.forEach(d => {
      //   console.log(d)
      //   console.log()
      // })


      createDOTGraph(sppf.root)

      // trees.forEach(tree => {
      //   console.log(toString(tree))
      // })

      const exec = (node) => {
        const resolve = (arcs) => {
          return arcs.map(arc => {
            if (arc instanceof Parser._SPPFIntermediateNode) {
              return resolve(arc.arcs)
            } else {
              return arc
            }
          }).reduce((a, x) => a.concat(x), [])
        }
        const args = resolve(node.arcs).map(exec)

        switch (node.item.name) {
          case 'E': {
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
          case 'operator-1': {
            return args[0]
          } break
          case 'operator-2': {
            return args[0]
          } break
          case 'N': {
            switch (args.length) {
              case 1: {
                return args[0]
              } break
              case 3: {
                return args[0] +
                  args[2] / Math.pow(10, Math.floor(Math.log10(args[2])) + 1)
              } break
            }
          } break
          case 'num': {
            switch (args.length) {
              case 1: {
                return parseInt(args[0])
              } break
              case 2: {
                return parseInt(args[0] + `${args[1]}`)
              } break
            }
          } break
          default: {
            return node.item.value
          }
        }
      }

      trees.forEach(tree => {
        console.log(`${code} | ${toString(tree)}`);
        // const expected = eval(code)
        // const result = exec(tree)
        // console.log(`Result: ${result}`)
        console.log('=================================================')
      })
    } catch (e) {
      console.log(e.message)
    }
  }
}

module.exports = Test
