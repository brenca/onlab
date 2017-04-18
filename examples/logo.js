const Language = require('../lib/language')
const { Lexer, Parser } = Language
const clone = require('clone')
const a = require('awaiting')

const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'
const spec = '\\\\.,\\/#!$%@&<>\\^\\*;:{}=\\-\\+_`~()\'"'

Array.prototype.toString = function () {
  return '[' + this.join(' ') + ']'
}
Array.prototype.equals = function (array) {
  if (!array) return false;
  if (this.length != array.length) return false;

  for (let i = 0, l = this.length; i < l; i++) {
    if (this[i] instanceof Array && array[i] instanceof Array) {
      if (!this[i].equals(array[i]))
        return false
    } else if (this[i] != array[i]) { 
      return false
    }
  }
  return true
}
Object.defineProperty(Array.prototype, "equals", {enumerable: false})

class Logo extends Language {
  constructor(handler) {
    super()
    this._handler = handler
    this._drawDelay = 100
    
    this.lexer.addTokenClasses([
      new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.[0-9]+)/),
      new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      new Lexer.TokenClass('bool', /(true|false)/i),
      new Lexer.TokenClass('not', /not/i),
      new Lexer.TokenClass('and', /and/i),
      new Lexer.TokenClass('or', /or/i),
      new Lexer.TokenClass('draw-cmd', 
        /(fd|forward|bk|backward|rt|right|lt|left)/i),
      new Lexer.TokenClass('objparam-cmd', /(firstput|lastput|item|member\?)/i),
      new Lexer.TokenClass('strparam-cmd', /(make|local)/i),
      new Lexer.TokenClass('general-cmd', /(list\?|number\?|word\?|output|thing)/i),
      new Lexer.TokenClass('moreparam-cmd', /(print)/i),
      new Lexer.TokenClass('twoormoreparam-cmd', /(list|word|sentence)/i),
      new Lexer.TokenClass('list-cmd', /(setpc|first|last|butfirst|butlast|uppercase|lowercase|count|empty\?|run)/i),
      new Lexer.TokenClass('math-cmd', /(abs|sin|cos|tan|arcsin|arccos|arctan|exp|integer|int|log10|log|random|round|sqrt|wait)/i),
      new Lexer.TokenClass('twomath-cmd', /(power|pow)/i),
      new Lexer.TokenClass('if-cmd', /if/i),
      new Lexer.TokenClass('for-cmd', /(for|repeat)/i),
      new Lexer.TokenClass('noparam-cmd', /(pi|euler|date|time|stop)/i),
      new Lexer.TokenClass('word', new RegExp('"[a-z' + acc + spec + '0-9]*', 'i')),
      new Lexer.TokenClass('var', new RegExp(':[a-z' + acc + '0-9]+', 'i')),
      new Lexer.TokenClass('literal', new RegExp('[a-z' + acc + '0-9]+', 'i')),
      new Lexer.TokenClass('char', /\S/)
    ])
    
    this.parser.fromBNF(
      `<Program> ::= <Program> <Expression> | ""
      <SubProgram> ::= "[" <Program> "]"
      <OptionalSubProgram> ::= <SubProgram> | ""
      <List> ::= "[" <ListInner> "]"
      <Expression> ::= <Token-var> | <ListCommand> | <GeneralCommand> | <ObjectParamCommand> | <StringParamCommand> | <MathCommand> | <TwoMathCommand> | <NoparamCommand> | <DrawCommand> | <For> | <If> | <MoreParamCommand> | <Group>
      <Parameter> ::= <Bool> | <ListOrString>
      <GeneralCommand> ::= <Token-general-cmd> <Parameter>
      <ListCommand> ::= <Token-list-cmd> <Parameter>
      <StringParamCommand> ::= <Token-strparam-cmd> <String> <Parameter>
      <ObjectParamCommand> ::= <Token-objparam-cmd> <Parameter> <Parameter>
      <MathCommand> ::= <Token-math-cmd> <Math>
      <TwoMathCommand> ::= <Token-twomath-cmd> <Math> <Math>
      <NoparamCommand> ::= <Token-noparam-cmd>
      <ListOrString> ::= <String> | <List>
      <String> ::= <Token-word> | <Token-literal>
      <DrawCommand> ::= <Token-draw-cmd> <Math>
      <For> ::= <Token-for-cmd> <Math> <SubProgram>
      <If> ::= <Token-if-cmd> <Bool> <SubProgram> <OptionalSubProgram>
      <ListInner> ::= <ListInner> <Parameter> | ""
      <MoreParamCommand> ::= <Token-moreparam-cmd> <Parameter> | <Token-twoormoreparam-cmd> <Parameter> <Parameter>
      <Parameters> ::= <Parameter> <Parameters> | ""
      
      <Group> ::= "(" <more-cmd> <Parameters> ")"
      <more-cmd> ::= <Token-twoormoreparam-cmd> | <Token-moreparam-cmd> | ""
      
      // Math expressions
      <Math> ::= <MathTerm> "+" <Math> | <MathTerm> "-" <Math> | <MathTerm>
      <MathTerm> ::= <MaybeSignedMathFactor> "*" <MathTerm> | <MaybeSignedMathFactor> "/" <MathTerm> | <MaybeSignedMathFactor> "%" <MathTerm> | <MaybeSignedMathFactor>
      <MaybeSignedMathFactor> ::= "+" <MathLiteral> | "-" <MathLiteral> | <MathLiteral>
      <MathLiteral> ::= <Expression> | <Token-int> | <Token-float>
      
      // Boolean expressions
      <Bool> ::= <BoolAND> <Token-or> <Bool> | <BoolAND>
      <BoolAND> ::= <BoolEQ> <Token-and> <BoolAND> | <BoolEQ>
      <BoolEQ> ::= <BoolCOMP> "==" <BoolEQ> | <BoolCOMP> "!=" <BoolEQ> | <BoolCOMP>
      <BoolCOMP> ::= <BoolNOT> "<" <BoolCOMP> | <BoolNOT> ">" <BoolCOMP> | <BoolNOT> "<=" <BoolCOMP> | <BoolNOT> ">=" <BoolCOMP> | <BoolNOT>
      <BoolNOT> ::= <Token-not> <BoolLiteral> | <BoolLiteral>
      <BoolLiteral> ::= <Math> | <Token-bool>
      `
    )
    
    this._scopes = [{}]
    
    this._actions = {
      'For': async (node) => {
        let parameters = []
        for (let child of node.children) {
          if (child.rule.name !== 'SubProgram') {
            parameters.push(await this.executeOne(child))
          } else {
            parameters.push(child)
          }
        }
        
        if (parameters.length === 3) {
          for (let i = 0; i < parameters[1]; i++) {
            let val = await this.executeOne(parameters[2])
            if (val instanceof Object && val.constructor !== Array) return val
          }
        }
      },
      'If': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          if (child.rule.name !== 'SubProgram') {
            parameters.push(await this.executeOne(child))
          } else {
            parameters.push(child)
          }
        }
        
        if (parameters.length === 4) {
          let val = parameters[1] ? await this.executeOne(parameters[2])
            : await this.executeOne(parameters[3])
          if (val instanceof Object && val.constructor !== Array) return val
        } else if (parameters.length === 3) {
          let val = parameters[1] ? await this.executeOne(parameters[2])
            : undefined
          if (val instanceof Object && val.constructor !== Array) return val
        }
      },
      'Group': async (node) => {
        node.children = node.children.slice(1,-1)
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        if (parameters.length > 1) {
          let ret = await this._actions['MoreParamCommand'](node)
          if (ret) return ret[0]
        } else {
          // TODO: syntax error, more elements in group
        }
        return parameters[0].length === 1 ? parameters[0][0] : parameters[0]
      },
      'MoreParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let actions = {
          'print': (params) => {
            console.log(params.join(' '))
          },
          'list': (params) => {
            return params
          },
          'word': (params) => {
            let out = ''
            params.forEach(x => { //TODO: possible throw error
              out += x.toString()
            })
            return out
          },
          'sentence': (params) => {
            return [].concat.apply([], params)
          }
        }
        
        let param
        if (parameters.length === 3) {
          return actions[parameters[0].toLowerCase()](
            [parameters[1], parameters[2]])
        } else {
          return actions[parameters[0].toLowerCase()]([parameters[1]])
        }
      },
      'Parameters': async (node) => {
        let list = []
        
        for (let child of node.children) {
          if (child.rule.name !== 'Parameters') {
            list.push(await this.executeOne(child))
          } else {
            list = list.concat(await this.executeOne(child))
          }
        }
        
        return list
      },
      'Program': async (node) => {
        if (node.parent === undefined) this._scopes.push({})
        
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) {
            if (node.parent === undefined) {
              this._scopes.pop({})
              return val.value
            } else {
              return val
            }
          }
        }
        
        if (node.parent === undefined) this._scopes.pop({})
      },
      'SubProgram': async (node) => {
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
        }
      },
      'GeneralCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let actions = {
          'list?': async (x) => {
            return x.constructor === Array
          },
          'number?': async (x) => {
            return typeof x == 'number'
          },
          'word?': async (x) => {
            return typeof x == 'string'
          },
          'output': async (x) => {
            return {
              return: true,
              value: x
            }
          },
          'thing': async (x) => {
            return this._getValue(x)
          }
        }
        
        return await actions[parameters[0].toLowerCase()](parameters[1])
      },
      'NoparamCommand': (node) => {
        let actions = {
          'pi': () => {
            return Math.PI
          },
          'euler': () => {
            return Math.E
          },
          'date': () => {
            return new Date().toISOString().slice(0, 10)
          },
          'time': () => {
            let date = new Date()
            return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`
          },
          'stop': () => {
            return {
              return: true,
              value: null
            }
          }
        }
        
        return actions[node.rule.value.toLowerCase()]()
      },
      'MathCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let mathActions = {
          'abs': async (m) => {
            return Math.abs(m)
          },
          'sin': async (m) => {
            return Math.sin(m)
          },
          'cos': async (m) => {
            return Math.cos(m)
          },
          'tan': async (m) => {
            return Math.tan(m)
          },
          'arcsin': async (m) => {
            return Math.asin(m)
          },
          'arccos': async (m) => {
            return Math.acos(m)
          },
          'arctan': async (m) => {
            return Math.atan(m)
          },
          'exp': async (m) => {
            return Math.exp(m)
          },
          'int': async (m) => {
            return Math.floor(m)
          },
          'log10': async (m) => {
            return Math.log10(m)
          },
          'log': async (m) => {
            return Math.log(m)
          },
          'random': async (m) => {
            return Math.floor(Math.random() * (Math.floor(m) + 1))
          },
          'round': async (m) => {
            return Math.round(m)
          },
          'sqrt': async (m) => {
            return Math.sqrt(m)
          },
          'wait': async (m) => {
            await a.delay(m)
          }
        }
        
        mathActions['integer'] = mathActions['int']
        
        return await mathActions[parameters[0].toLowerCase()](parameters[1])
      },
      'TwoMathCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let mathActions = {
          'pow': (a, b) => {
            return Math.pow(a, b)
          }
        }
        
        mathActions['power'] = mathActions['pow']
        
        return mathActions[parameters[0].toLowerCase()](
          parameters[1], parameters[2])
      },
      'ObjectParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let objectParamActions = {
          'firstput': (o, l) => {
            return [o].concat(l)
          },
          'lastput': (o, l) => {
            return l.concat([o])
          },
          'item': (o, l) => {
            return l[o - 1]
          },
          'member?': (o, l) => {
            return !!l.find(x => {
              if (x.equals)
                return x.equals(o)
              return x === o
            })
          }
        }
        
        return objectParamActions[parameters[0].toLowerCase()](
          parameters[1],parameters[2])
      },
      'StringParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let stringParamActions = {
          'make': (s, v) => {
            this._setValue(s, v)
          },
          'local': (s, v) => {
            this._scopes[this._scopes.length - 1][s] = v
          }
        }
        
        return stringParamActions[parameters[0].toLowerCase()](
          parameters[1],parameters[2])
      },
      'ListCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let listActions = {
          'setpc': async (l) => {
            return l
          },
          'first': async (l) => {
            return l[0]
          },
          'butfirst': async (l) => {
            return l.slice(1, l.length)
          },
          'last': async (l) => {
            return l[l.length - 1]
          },
          'butlast': async (l) => {
            return l.slice(0, -1)
          },
          'lowercase': async (l) => {
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
          'uppercase': async (l) => {
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
          'count': async (l) => {
            return l.length
          },
          'empty?': async (l) => {
            return l.length === 0
          },
          'run': async (l) => {
            let str = l.join(' ')
            return await this.execute(str)
          }
        }
        
        return await listActions[parameters[0].toLowerCase()](parameters[1])
      },
      'List': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          parameters.push(await this.executeOne(child))
        }
        
        return parameters[0] ? parameters[0] : []
      },
      'ListInner': async(node) => {
        let list = []
        
        for (let child of node.children) {
          if (child.rule.name !== 'ListInner') {
            list.push(await this.executeOne(child))
          } else {
            list = list.concat(await this.executeOne(child))
          }
        }
        
        return list
      },
      'Math': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
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
      'MathFactor': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          parameters.push(await this.executeOne(child))
        }
        
        return parameters[0]
      },
      'MathGroup': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          parameters.push(await this.executeOne(child))
        }
        
        return parameters[0]
      },
      'MathTerm': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        let mathActions = {
          '/': (a, b) => {
            return a / b
          },
          '*': (a, b) => {
            return a * b
          },
          '%': (a, b) => {
            return a % b
          }
        }
        
        return mathActions[parameters[1]](parameters[0], parameters[2])
      },
      'MaybeSignedMathFactor': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
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
      'Bool': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        return parameters[0] || parameters[2]
      },
      'BoolAND': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        return parameters[0] && parameters[2]
      },
      'BoolNOT': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
        return !parameters[1]
      },
      'BoolCOMP': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
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
      'BoolEQ': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
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
      'BoolFactor': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          parameters.push(await this.executeOne(child))
        }
        
        return parameters[0]
      },
      'DrawCommand': async (node) => {
        await a.delay(this._drawDelay)
        let parameters = []
        for (let child of node.children) {
          parameters.push(await this.executeOne(child))
        }
        
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
      'int': async (node) => {
        return parseInt(node.rule.value)
      },
      'float': async (node) => {
        return parseFloat(node.rule.value)
      },
      'word': async (node) => {
        return node.rule.value.slice(1)
      },
      'literal': async (node) => {
        return node.rule.value
      },
      'bool': async (node) => {
        if (node.rule.value === 'true')
          return true
        return false
      },
      'noparam-cmd': async (node) => {
        return await this._actions['NoparamCommand'](node)
      },
      'var': async (node) => {
        return this._getValue(node.rule.value.slice(1))
      }
    }
  }
  
  _getValue(str) {
    for (let i = this._scopes.length - 1; i >= 0; i--) {
      if (this._scopes[i][str] !== undefined) return this._scopes[i][str]
    }
  }
  
  _setValue(str, val) {
    for (let i = this._scopes.length - 1; i >= 0; i--) {
      if (this._scopes[i][str] !== undefined) {
        this._scopes[i][str] = val
        return
      }
    }
    
    this._scopes[this._scopes.length - 1][str] = val
  }
  
  async executeOne(node) { 
    if (this._actions[node.rule.name]) {
      return await this._actions[node.rule.name](node)
    } else if (node.rule.class){
      if (this._parses[node.rule.class.name]) {
        return await this._parses[node.rule.class.name](node)
      } else {
        return node.rule.value
      }
    } else {
      console.log(node);
    }
  }
  
  async execute(code) {
    let ast = this.buildAST(code)
    return await this.executeOne(ast[0])
  }
}

module.exports = Logo