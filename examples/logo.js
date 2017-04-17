const Language = require('../lib/language')
const { Lexer, Parser } = Language

const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'

class Logo extends Language {
  constructor(handler) {
    super()
    this._handler = handler
    
    this.lexer.addTokenClasses([
      new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.[0-9]+)/),
      new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      new Lexer.TokenClass('draw-cmd', 
        /(fd|forward|bk|backward|rt|right|lt|left)/),
      new Lexer.TokenClass('list-cmd', /(setpc|first|last|butfirst|butlast)/),
      new Lexer.TokenClass('objlist-cmd', /(putfirst|putlast)/),
      new Lexer.TokenClass('for-cmd', /for/),
      new Lexer.TokenClass('word', new RegExp('"[a-z' + acc + '0-9]+')),
      new Lexer.TokenClass('string', new RegExp('\[[a-z' + acc + ']+[a-z' + acc + '0-9 ]+\]')),
      new Lexer.TokenClass('char', /\S/)
    ])
    
    this.parser.fromBNF(
      `<Program> ::= <Program> <Expression> | ""
      <SubProgram> ::= "[" <Program> "]"
      <List> ::= "[" <ListInner> "]"
      <Expression> ::= <ListCommand> | <ObjectListCommand> | <DrawCommand> | <For>
      <Parameter> ::= <Expression> | <Math> | <List> | "" | <Token-word> | <Token-string>
      <ListCommand> ::= <Token-list-cmd> <ListOrString>
      <ObjectListCommand> ::= <Token-objlist-cmd> <Parameter> <ListOrString>
      <String> ::= <Token-word> | <Token-string>
      <ListOrString> ::= <String> | <List>
      <DrawCommand> ::= <Token-draw-cmd> <Math>
      <For> ::= <Token-for-cmd> <Math> <SubProgram>
      <ListInner> ::= <ListInner> <ListElement> | ""
      <ListElement> ::= <Math> | <List> | <Expression>
      
      // Math expressions
      <Math> ::= <InnerMath> | ""
      <InnerMath> ::= <InnerMath> <PlusMinus> <MaybeMultiplyDivide> | <MaybeMultiplyDivide>
      <SubMath> ::= "(" <Math> ")" | <Token-int> | <Token-float>
      <MaybeMultiplyDivide> ::= <MaybeMultiplyDivide> <MultiplyDivide> <SubMath> | <SubMath>
      <MultiplyDivide> ::= "*" | "/"
      <PlusMinus> ::= "+" | "-"`
    )
    
    this._actions = {
      'For': (node) => {
        let parameters = node.children.map(child => {
          if (child.rule.name !== 'SubProgram')
            return this.executeOne(child)
          else 
            return child
        })
        
        if (parameters.length === 3)
          for (let i = 0; i < parameters[1]; i++)
            this.executeOne(parameters[2])
      },
      'Program': (node) => {
        node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
      },
      'SubProgram': (node) => {
        node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
      },
      'ObjectListCommand': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let objectListActions = {
          'putfirst': (o, l) => {
            return [o].concat(l)
          },
          'putlast': (o, l) => {
            return l.concat([o])
          }
        }
        console.log(objectListActions[parameters[0]](parameters[1],parameters[2]));
        return objectListActions[parameters[0]](parameters[1],parameters[2])
      },
      'ListCommand': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let listActions = {
          'setpc': (l) => {
            return l
          },
          'first': (l) => {
            return l[0]
          },
          'butfirst': (l) => {
            return l.slice(1, l.length)
          },
          'last': (l) => {
            return l[l.length - 1]
          },
          'butlast': (l) => {
            return l.slice(0, -1)
          }
        }
        console.log(listActions[parameters[0]](parameters[1]));
        return listActions[parameters[0]](parameters[1])
      },
      'List': (node) => {
        let parameters = node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
        
        return parameters[0]
      },
      'ListInner': (node) => {
        let list = []
        let parameters = node.children.forEach(child => {
          if (child.rule.name !== 'ListInner')
            list.push(this.executeOne(child))
          else
            list = list.concat(this.executeOne(child))
        })
        
        return list
      },
      'InnerMath': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let mathActions = {
          '+': (a, b) => {
            return a + b
          },
          '-': (a, b) => {
            return a - b
          },
          '/': (a, b) => {
            return a / b
          },
          '*': (a, b) => {
            return a * b
          }
        }
        
        return mathActions[parameters[1]](parameters[0], parameters[2])
      },
      'DrawCommand': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let drawActions = {
          'fd': (a) => {
            this._handler('forward', a)
          },
          'bk': (a) => {
            this._handler('back', a)
          },
          'lt': (a) => {
            this._handler('left', a)
          },
          'rt': (a) => {
            this._handler('right', a)
          }
        }
        drawActions['forward'] = drawActions['fd']
        drawActions['backward'] = drawActions['bk']
        drawActions['right'] = drawActions['rt']
        drawActions['left'] = drawActions['lt']
        
        drawActions[parameters[0]](parameters[1])
      }
    }
    
    this._parses = {
      'int': (node) => {
        return parseInt(node.rule.value)
      },
      'float': (node) => {
        return parseFloat(node.rule.value)
      },
      'word': (node) => {
        return node.rule.value.slice(1)
      },
      'string': (node) => {
        return node.rule.value.slice(1,-1)
      }
    }
  }
  
  executeOne(node) {    
    // console.log(node);
    if (this._actions[node.rule.name]) {
      return this._actions[node.rule.name](node)
    } else if (node.rule.class){
      if (this._parses[node.rule.class.name]) {
        return this._parses[node.rule.class.name](node)
      } else {
        return node.rule.value
      }
    } else {
      console.log(node);
    }
  }
  
  execute(code) {
    let ast = this.buildAST(code)
    return this.executeOne(ast[0])
  }
}

module.exports = Logo