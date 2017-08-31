const Language = require('../lib/language')
const EventEmitter = require('events')
const { Lexer, Parser } = Language

const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'
const spec = '\\\\.,\\/#!$%@&<>\\^\\*;:{}=\\-\\+_`~()\'"'

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
    // 
    // this.parser.fromBNF(`
    //   <S> ::= <S> <S> | "x" | ""
    // `)
    
    // this.parser.fromBNF(`
    //   <S> ::= <A> "x"
    //   <A> ::= "x"
    // `)
    
    this.parser.fromBNF(`
      <S> ::= "x" | <B> <S> "bah" | <A> <S> "bah"
      <B> ::= <A> <A>
      <A> ::= ""
    `)
    
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
    
    // this.parser.addDisambiguator('C', node => {
    //   let count = 1
    //   
    //   // while (node)
    //     // console.log(node.parent.parent.node.children.map(child => child.rule.name || child.rule.value))
    //   
    //   // console.log(node.node);
    //   
    //   let c = node.node
    //   while (c.children[0].rule.name === 'C') {
    //     count ++
    //     c = c.children[0]
    //   }
    //   // console.log('C');
    //   // console.log(c.children[0])
    //   return (count > 3)
    // })
    
    // this.parser.addDisambiguator('A', stackNode => {
    //   const countCs = child => {
    //     let count = 0
    //     let c = child
    //     while (c.rule.name === 'C') {
    //       count ++
    //       c = c.children[0]
    //     }
    //     return count
    //   }
    //   let bValue = -1
    //   return stackNode.node.children.some(child => {
    //     switch (child.rule.name) {
    //       case 'R':
    //         bValue = countCs(child.children[1])
    //         break
    //       case 'C':
    //         if (bValue > 0 && countCs(child) > bValue) return true
    //         break
    //     }
    //   })
    // })
  }
  
  execute(code) {
    let pp = (node, indent = 0) => {
      let ind = Array(indent + 1).join('  ')
      console.log(ind + (node.rule.name || node.rule.value))
      node.children.forEach(child => {
        pp(child, indent + 1)
      })
    }
    let ast = this.buildAST(code)
    console.log('--------------------------------')
    console.log('Number of parses: ' + ast.length)
    console.log('--------------------------------')
    ast.forEach(ast => {
      pp(ast[0])
    })
  }
}

module.exports = Test