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
      new Lexer.TokenClass('bool', /(true|false)/i),
      new Lexer.TokenClass('not', /not/i),
      new Lexer.TokenClass('and', /and/i),
      new Lexer.TokenClass('or', /or/i),
      new Lexer.TokenClass('draw-cmd', 
        /(fd|forward|bk|backward|rt|right|lt|left)/i),
      new Lexer.TokenClass('objlist-cmd', /(firstput|lastput|item)/i),
      new Lexer.TokenClass('list-cmd', /(setpc|first|last|butfirst|butlast|uppercase|lowercase|count|empty\?)/i),
      new Lexer.TokenClass('math-cmd', /(abs|sin|cos|tan|arcsin|arccos|arctan|exp|integer|int|log10|log)/i),
      new Lexer.TokenClass('if-cmd', /if/i),
      new Lexer.TokenClass('for-cmd', /for/i),
      new Lexer.TokenClass('ctorlist-cmd', /list/i),
      new Lexer.TokenClass('word', new RegExp('"[a-z' + acc + '0-9]*', 'i')),
      new Lexer.TokenClass('literal', new RegExp('[a-z' + acc + '0-9]+', 'i')),
      new Lexer.TokenClass('char', /\S/)
    ])
    
    this.parser.fromBNF(
      `<Program> ::= <Program> <Expression> | ""
      <SubProgram> ::= "[" <Program> "]"
      <List> ::= "[" <ListInner> "]"
      <Expression> ::= <ListCommand> | <ObjectListCommand> | <MathCommand> | <DrawCommand> | <For> | <If> | <ConstructList>
      <Parameter> ::= <Math> | <ListOrString>
      <ListCommand> ::= <Token-list-cmd> <Parameter>
      <ObjectListCommand> ::= <Token-objlist-cmd> <Parameter> <Parameter>
      <MathCommand> ::= <Token-math-cmd> <Math>
      <ListOrString> ::= <String> | <List>
      <String> ::= <Token-word> | <Token-literal>
      <DrawCommand> ::= <Token-draw-cmd> <Math>
      <For> ::= <Token-for-cmd> <Math> <SubProgram>
      <If> ::= <Token-if-cmd> <Bool> <SubProgram> <SubProgram>
      <ListInner> ::= <ListInner> <Parameter> | ""
      <ConstructList> ::= <Token-ctorlist-cmd> <TwoParameters> | "(" <Token-ctorlist-cmd> <Parameters> ")"
      <TwoParameters> ::= <Parameter> <Parameter>
      <Parameters> ::= <Parameter> <Parameters> | ""
      
      // Math expressions
      <Math> ::= <MathTerm> "+" <Math> | <MathTerm> "-" <Math> | <MathTerm>
      <MathTerm> ::= <MaybeSignedMathFactor> "*" <MathTerm> | <MaybeSignedMathFactor> "/" <MathTerm> | <MaybeSignedMathFactor>
      <MaybeSignedMathFactor> ::= "+" <MathFactor> | "-" <MathFactor> | <MathFactor>
      <MathFactor> ::= <MathGroup> | <MathLiteral>
      <MathGroup> ::= "(" <Math> ")"
      <MathLiteral> ::= <Expression> | <Token-int> | <Token-float>
      
      // Boolean expressions
      <Bool> ::= <BoolAND> <Token-or> <Bool> | <BoolAND>
      <BoolAND> ::= <BoolEQ> <Token-and> <BoolAND> | <BoolEQ>
      <BoolEQ> ::= <BoolCOMP> "==" <BoolEQ> | <BoolCOMP> "!=" <BoolEQ> | <BoolCOMP>
      <BoolCOMP> ::= <BoolNOT> "<" <BoolCOMP> | <BoolNOT> ">" <BoolCOMP> | <BoolNOT> "<=" <BoolCOMP> | <BoolNOT> ">=" <BoolCOMP> | <BoolNOT>
      <BoolNOT> ::= <Token-not> <BoolFactor> | <BoolFactor>
      <BoolFactor> ::= "(" <Bool> ")" | <BoolLiteral>
      <BoolLiteral> ::= <Math> | <Token-bool>
      `
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
      'If': (node) => {
        let parameters = node.children.map(child => {
          if (child.rule.name !== 'SubProgram')
            return this.executeOne(child)
          else 
            return child
        })
        
        if (parameters.length === 4) {
          if (parameters[1]) {
            this.executeOne(parameters[2])
          } else {
            this.executeOne(parameters[3])
          }
        }
      },
      'ConstructList': (node) => {
        let parameters = node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
        
        console.log(parameters[0] ? parameters[0] : []);
        
        return parameters[0] ? parameters[0] : []
      },
      'TwoParameters': (node) => {
        let list = []
        
        let parameters = node.children.forEach(child => {
          if (child.rule.name !== 'Parameters') {
            list.push(this.executeOne(child))
          } else {
            list = list.concat(this.executeOne(child))
          }
        })
        
        return list
      },
      'Parameters': (node) => {
        let list = []
        
        let parameters = node.children.forEach(child => {
          if (child.rule.name !== 'Parameters') {
            list.push(this.executeOne(child))
          } else {
            list = list.concat(this.executeOne(child))
          }
        })
        
        return list
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
      'MathCommand': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let mathActions = {
          'abs': (m) => {
            return Math.abs(m)
          },
          'sin': (m) => {
            return Math.sin(m)
          },
          'cos': (m) => {
            return Math.cos(m)
          },
          'tan': (m) => {
            return Math.tan(m)
          },
          'arcsin': (m) => {
            return Math.asin(m)
          },
          'arccos': (m) => {
            return Math.acos(m)
          },
          'arctan': (m) => {
            return Math.atan(m)
          },
          'exp': (m) => {
            return Math.exp(m)
          },
          'int': (m) => {
            return Math.floor(m)
          },
          'log10': (m) => {
            return Math.log10(m)
          },
          'log': (m) => {
            return Math.log(m)
          }
        }
        
        mathActions['integer'] = mathActions['int']
        // mathActions['backward'] = mathActions['bk']
        // mathActions['right'] = mathActions['rt']
        // mathActions['left'] = mathActions['lt']
        
        return mathActions[parameters[0].toLowerCase()](parameters[1])
      },
      'ObjectListCommand': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let objectListActions = {
          'firstput': (o, l) => {
            return [o].concat(l)
          },
          'lastput': (o, l) => {
            return l.concat([o])
          },
          'item': (o, l) => {
            return l[o - 1]
          }
        }
        console.log(objectListActions[parameters[0].toLowerCase()](parameters[1],parameters[2]));
        return objectListActions[parameters[0].toLowerCase()](parameters[1],parameters[2])
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
          },
          'lowercase': (l) => {
            if (typeof l === 'string' || l instanceof String) {
              return l.toLowerCase()
            } else {
              return l.map(item => {
                if (typeof item === 'string' || item instanceof String) {
                  return item.toLowerCase()
                } else {
                  return item
                }
              })
            }
          },
          'uppercase': (l) => {
            if (typeof l === 'string' || l instanceof String) {
              return l.toUpperCase()
            } else {
              return l.map(item => {
                if (typeof item === 'string' || item instanceof String) {
                  return item.toUpperCase()
                } else {
                  return item
                }
              })
            }
          },
          'count': (l) => {
            return l.length
          },
          'empty?': (l) => {
            return l.length === 0
          }
        }
        console.log(listActions[parameters[0].toLowerCase()](parameters[1]));
        return listActions[parameters[0].toLowerCase()](parameters[1])
      },
      'List': (node) => {
        let parameters = node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
        
        return parameters[0] ? parameters[0] : []
      },
      'ListInner': (node) => {
        let list = []
        
        let parameters = node.children.forEach(child => {
          if (child.rule.name !== 'ListInner') {
            list.push(this.executeOne(child))
          } else {
            list = list.concat(this.executeOne(child))
          }
        })
        
        return list
      },
      'Math': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let mathActions = {
          '+': (a, b) => {
            return a + b
          },
          '-': (a, b) => {
            return a - b
          }
        }
        
        return mathActions[parameters[1]](parameters[0], parameters[2])
      },
      'MathFactor': (node) => {
        let parameters = node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
        
        return parameters[0]
      },
      'MathGroup': (node) => {
        let parameters = node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
        
        return parameters[0]
      },
      'MathTerm': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let mathActions = {
          '/': (a, b) => {
            return a / b
          },
          '*': (a, b) => {
            return a * b
          }
        }
        
        return mathActions[parameters[1]](parameters[0], parameters[2])
      },
      'MaybeSignedMathFactor': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        if (parameters.length === 1) {
          return parameters[0]
        } else {
          if (parameters[0] === '-') {
            return -parameters[1]
          } else {
            return parameters[1]
          }
        }
      },
      'Bool': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        return parameters[0] || parameters[2]
      },
      'BoolAND': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        return parameters[0] && parameters[2]
      },
      'BoolNOT': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        return !parameters[1]
      },
      'BoolCOMP': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let boolActions = {
          '<': (a, b) => {
            return a < b
          },
          '>': (a, b) => {
            return a > b
          }
        }
        
        return boolActions[parameters[1]](parameters[0], parameters[2])
      },
      'BoolEQ': (node) => {
        let parameters = node.children.map(child => {
          return this.executeOne(child)
        })
        
        let boolActions = {
          '==': (a, b) => {
            return a == b
          },
          '!=': (a, b) => {
            return a != b
          }
        }
        
        return boolActions[parameters[1]](parameters[0], parameters[2])
      },
      'BoolFactor': (node) => {
        let parameters = node.reducedChildren().map(child => {
          return this.executeOne(child)
        })
        
        return parameters[0]
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
        
        drawActions[parameters[0].toLowerCase()](parameters[1])
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
      'literal': (node) => {
        return node.rule.value
      },
      'bool': (node) => {
        if (node.rule.value === 'true')
          return true
        return false
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