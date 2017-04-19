const Language = require('../lib/language')
const { Lexer, Parser } = Language
const clone = require('clone')
const a = require('awaiting')

const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'
const spec = '\\\\.,\\/#!$%@&<>\\^\\*;:{}=\\-\\+_`~()\'"'

class RuntimeError extends Error {
  constructor(message, position, extra) {
    const _constructMessage = (message, position, extra) => {
      if (position) {
        message += ' - at :' + (position.line + 1) + ':' + (position.char + 1)
      }
      if (extra) {
        message += '\n' + extra
      }
      return message
    }
    
    super(_constructMessage(message, position, extra))
    this.name = 'RuntimeError'
    this.position = position
    this.extra = extra
  }
}

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
    this._drawDelay = 10
    this._executionDelay = 0
    this._executing = false
    
    this.lexer.addTokenClasses([
      new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.[0-9]+)/),
      new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      new Lexer.TokenClass('bool', /(?:\b)(true|false)(?!\w)/iu),
      new Lexer.TokenClass('not', /(?:\b)not(?!\w)/iu),
      new Lexer.TokenClass('and', /(?:\b)and(?!\w)/iu),
      new Lexer.TokenClass('or', /(?:\b)or(?!\w)/iu),
      new Lexer.TokenClass('draw-cmd', /(?:\b)(fd|forward|bk|backward|rt|right|lt|left)(?!\w)/iu),
      new Lexer.TokenClass('objparam-cmd', /(?:\b)(firstput|lastput|item|member\?)(?!\w)/iu),
      new Lexer.TokenClass('strparam-cmd', /(?:\b)(make|local)(?!\w)/iu),
      new Lexer.TokenClass('general-cmd', /(?:\b)(list\?|number\?|word\?|output|thing|setpencolor|setpenwidth|setpen|setpc|towards)(?!\w)/iu),
      new Lexer.TokenClass('moreparam-cmd', /(?:\b)(print)(?!\w)/iu),
      new Lexer.TokenClass('twoormoreparam-cmd', /(?:\b)(list|word|sentence)(?!\w)/iu),
      new Lexer.TokenClass('list-cmd', /(?:\b)(first|last|butfirst|butlast|uppercase|lowercase|count|empty\?|run|setposition)(?!\w)/iu),
      new Lexer.TokenClass('math-cmd', /(?:\b)(abs|sin|cos|tan|arcsin|arccos|arctan|exp|integer|int|log10|log|random|round|sqrt|wait|setx|sety|setheading)(?!\w)/iu),
      new Lexer.TokenClass('twomath-cmd', /(?:\b)(power|pow)(?!\w)/iu),
      new Lexer.TokenClass('if-cmd', /(?:\b)if(?!\w)/iu),
      new Lexer.TokenClass('for-cmd', /(?:\b)(for|repeat)(?!\w)/iu),
      new Lexer.TokenClass('to-cmd', /(?:\b)to(?!\w)/iu),
      new Lexer.TokenClass('end', /(?:\b)end(?!\w)/iu),
      new Lexer.TokenClass('noparam-cmd', /(?:\b)(pi|date|time|stop|heading|hideturtle|showturtle|shown\?|position|xpos|ypos|home|clean|clearscreen|cs|pendown|pd|penup|pu|penwidth|pencolor|pc|pen|e)(?!\w)/iu),
      new Lexer.TokenClass('word', new RegExp('"[a-z' + acc + spec + '0-9]*', 'iu')),
      new Lexer.TokenClass('var', new RegExp(':[a-z' + acc + '0-9]+', 'iu')),
      new Lexer.TokenClass('literal', new RegExp('[a-z' + acc + '0-9]+', 'iu')),
      new Lexer.TokenClass('char', /\S/iu)
    ])
    
    this.parser.fromBNF(
      `<Program> ::= <Program> <Expression> | ""
      <SubProgram> ::= "[" <Program> "]"
      <OptionalSubProgram> ::= <SubProgram> | ""
      <List> ::= "[" <ListInner> "]"
      <Expression> ::= <Token-var> | <ListCommand> | <GeneralCommand> | <ObjectParamCommand> | <StringParamCommand> | <MathCommand> | <TwoMathCommand> | <NoparamCommand> | <DrawCommand> | <For> | <If> | <To> | <MoreParamCommand> | <Group> | <UserDefined>
      <Parameter> ::= <Bool> | <ListOrString>
      <GeneralCommand> ::= <Token-general-cmd> <Parameter>
      <ListCommand> ::= <Token-list-cmd> <Parameter>
      <StringParamCommand> ::= <Token-strparam-cmd> <String> <Parameter>
      <ObjectParamCommand> ::= <Token-objparam-cmd> <Parameter> <Parameter>
      <MathCommand> ::= <Token-math-cmd> <Math>
      <TwoMathCommand> ::= <Token-twomath-cmd> <Math> <Math>
      <NoparamCommand> ::= <Token-noparam-cmd>
      <ListOrString> ::= <String> | <List>
      <String> ::= <Token-word>
      <DrawCommand> ::= <Token-draw-cmd> <Math>
      <For> ::= <Token-for-cmd> <Math> <SubProgram>
      <If> ::= <Token-if-cmd> <Bool> <SubProgram> <OptionalSubProgram>
      <To> ::= <Token-to-cmd> <Token-literal> <Variables> <Program> <Token-end>
      <Variables> ::= <Variables> <Token-var> | ""
      <ListInner> ::= <ListInner> <Parameter> | ""
      <MoreParamCommand> ::= <Token-moreparam-cmd> <Parameter> | <Token-twoormoreparam-cmd> <Parameter> <Parameter>
      <UserDefined> ::= <Token-literal> <Parameters>
      <Parameters> ::= <Parameter> <Parameters> | "" | <Token-EOF>
      
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
    
    this._procedures = []
    this._scopes = [{
      variables: {},
      stack: []
    }]
    
    this._actions = {
      'UserDefined': async (node, parent) => {
        let name = await this.executeOne(node.children[0], node)
        let result = undefined
        
        let flattenParameters = (node) => {
          let list = []
          
          for (let child of node.children) {
            if (child.rule.name !== 'Parameters' 
             && child.rule.name !== 'Token-EOF') {
              list.push(child)
            } else {
              list = list.concat(flattenParameters(child))
            }
          }
          
          return list
        }
        
        let parameters = []
        if (node.children[1].rule.name === 'Parameters') {
          parameters = flattenParameters(node.children[1])
        }
        
        if (this._procedures[name]) {
          const proc = clone(this._procedures[name])
          let param = []
          let children = parameters.splice(0, proc.parameters.length)
          for (let child of children) {
            let val = await this.executeOne(child, node)
            if (val instanceof Object && val.constructor !== Array) return val
            param.push(val)
          }
          
          let variables = {}
          for (let i = 0; i < proc.parameters.length; i++) {
            variables[proc.parameters[i]] = param[i]
          }
          
          this._scopes.push({
            variables,
            stack: []
          })
          let body = clone(proc.body)
          body.parent = node
          result = await this.executeOne(body)
          this._scopes.pop()
          
          if (parameters[0] && parameters[0].rule.value) {
            throw new Parser.SyntaxError('Unexpected token "' + 
              (parameters[0].rule.name || parameters[0].rule.value) + '"',
              parameters[0].rule.position
            )
          }
        } else {
          result = {
            value: name
          }
        }
        
        let index = parent.children.indexOf(node)
        if (index > -1) {
          Array.prototype.splice.apply(
            parent.children, 
            [index + 1, 0].concat(parameters.map(param => {
              param.parent = parent
              return param
            }))
          )
        }
        
        return result ? result.value : undefined
      },
      'To': async (node) => {
        node.children = node.children.slice(1, -1)
        let parameters = []
        for (let child of node.children) {
          if (child.rule.name !== 'Program') {
            parameters.push(await this.executeOne(child, node))
          } else {
            parameters.push(child)
          }
        }
        
        if (parameters.length === 3) {
          this._procedures[parameters[0]] = {
            name: parameters[0],
            parameters: parameters[1],
            body: parameters[2]
          }
        } else {
          this._procedures[parameters[0]] = {
            name: parameters[0],
            parameters: [],
            body: parameters[1]
          }
        }
      },
      'For': async (node) => {
        let parameters = []
        for (let child of node.children) {
          if (child.rule.name !== 'SubProgram') {
            let val = await this.executeOne(child, node)
            if (val instanceof Object && val.constructor !== Array) return val
            parameters.push(val)
          } else {
            parameters.push(child)
          }
        }
        
        if (parameters.length === 3) {
          for (let i = 0; i < parameters[1]; i++) {
            this._putToStack(parameters[0].toLowerCase(), i)
            let val = await this.executeOne(parameters[2])
            if (val instanceof Object && val.constructor !== Array) return val
          }
        }
      },
      'If': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          if (child.rule.name !== 'SubProgram') {
            let val = await this.executeOne(child, node)
            if (val instanceof Object && val.constructor !== Array) return val
            parameters.push(val)
          } else {
            parameters.push(child)
          }
        }
        
        this._putToStack(parameters[0].toLowerCase(), parameters[1])
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
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        if (parameters.length > 1) {
          let ret = await this._actions['MoreParamCommand'](node)
          if (ret) return ret[0]
        } else {
          return Promise.reject(
            new RuntimeError(
              'Too many group elements ', 
              node.position, 
              this._getStackTrace()
            )
          )
        }
        return parameters[0].length === 1 ? parameters[0][0] : parameters[0]
      },
      'Variables': async (node) => {
        let parameters = []
        for (let child of node.children) {
          parameters.push(child.rule.value.slice(1))
        }
        
        return parameters
      },
      'MoreParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
            for (let i = 0; i < params.length; i++) {
              if (typeof params[i] !== 'string') {
                return Promise.reject(
                  new RuntimeError(
                    'Parameter is not a word',
                    node.position,
                    this._getStackTrace()
                  )
                )
              }
              out += params[i]
            }
            return out
          },
          'sentence': (params) => {
            return [].concat.apply([], params)
          }
        }
        
        if (parameters.length === 3) {
          this._putToStack(parameters[0].toLowerCase(), 
            [parameters[1], parameters[2]])
          return actions[parameters[0].toLowerCase()](
            [parameters[1], parameters[2]])
        } else {
          this._putToStack(parameters[0].toLowerCase(), [parameters[1]])
          return actions[parameters[0].toLowerCase()]([parameters[1]])
        }
      },
      'Parameters': async (node) => {
        let list = []
        
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          if (child.rule.name !== 'Parameters') {
            list.push(val)
          } else {
            list = list.concat(val)
          }
        }
        
        return list
      },
      'Program': async (node) => {
        if (node.parent === undefined) this._scopes.push({
          variables: {},
          stack: []
        })
        
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) {
            if (node.parent === undefined) {
              this._scopes.pop()
              return val.value
            } else {
              return val
            }
          }
        }
        
        if (node.parent === undefined) this._scopes.pop()
      },
      'SubProgram': async (node) => {
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
        }
      },
      'GeneralCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
          },
          'setpen': async (x) => {
            this._handler.drawing = x[0]
            this._handler.color = x[1]
          },
          'setpc': async (x) => {
            this._handler.color = x
          },
          'setpenwidth': async (x) => {
            this._handler.width = x
          },
          'towards': async (x) => {
            return Math.atan2(
              x[0] - this._handler.x, 
              x[1] - this._handler.y
            ) / (2.0 * Math.PI) * 360.0
          }
        }
        actions['setpencolor'] = actions['setpc']
        
        this._putToStack(parameters[0].toLowerCase(), parameters[1])
        return await actions[parameters[0].toLowerCase()](parameters[1])
      },
      'NoparamCommand': (node) => {        
        let actions = {
          'pi': () => {
            return Math.PI
          },
          'e': () => {
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
          },
          'heading': () => {
            return this._handler.heading
          },
          'hideturtle': () => {
            this._handler.shown = false
          },
          'showturtle': () => {
            this._handler.shown = true
          },
          'shown?': () => {
            return this._handler.shown
          },
          'position': () => {
            return [this._handler.x, this._handler.y]
          },
          'xpos': () => {
            return this._handler.x
          },
          'ypos': () => {
            return this._handler.y
          },
          'home': () => {
            this._handler.resetTurtle()
          },
          'clean': () => {
            this._handler.eraseCanvas()
          },
          'clearscreen': () => {
            this._handler.eraseCanvas()
            this._handler.resetTurtle()
          },
          'pendown': () => {
            this._handler.drawing = true
          },
          'penup': () => {
            this._handler.drawing = false
          },
          'penwidth': () => {
            return this._handler.width
          },
          'pencolor': () => {
            return this._handler.color
          },
          'pen': () => {
            return [this._handler.drawing, this._handler.color]
          }
        }
        actions['cs'] = actions['clearscreen']
        actions['pd'] = actions['pendown']
        actions['pu'] = actions['penup']
        actions['pc'] = actions['pencolor']
        
        this._putToStack(node.rule.value.toLowerCase())
        return actions[node.rule.value.toLowerCase()]()
      },
      'MathCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
          },
          'setx': async (m) => {
            this._handler.x = m
          },
          'sety': async (m) => {
            this._handler.y = m
          },
          'setheading': async (m) => {
            this._handler.heading = m
          }
        }
        mathActions['integer'] = mathActions['int']
        
        this._putToStack(parameters[0].toLowerCase(), parameters[1])
        return await mathActions[parameters[0].toLowerCase()](parameters[1])
      },
      'TwoMathCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let mathActions = {
          'pow': (a, b) => {
            return Math.pow(a, b)
          }
        }
        mathActions['power'] = mathActions['pow']
        
        this._putToStack(parameters[0].toLowerCase(), 
          [parameters[1], parameters[2]])
        return mathActions[parameters[0].toLowerCase()](
          parameters[1], parameters[2])
      },
      'ObjectParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
        
        this._putToStack(parameters[0].toLowerCase(), 
          [parameters[1], parameters[2]])
        return objectParamActions[parameters[0].toLowerCase()](
          parameters[1],parameters[2])
      },
      'StringParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let stringParamActions = {
          'make': (s, v) => {
            this._setValue(s, v)
          },
          'local': (s, v) => {
            this._scopes[this._scopes.length - 1].variables[s] = v
          }
        }
        
        this._putToStack(parameters[0].toLowerCase(), 
          [parameters[1], parameters[2]])
        return stringParamActions[parameters[0].toLowerCase()](
          parameters[1],parameters[2])
      },
      'ListCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let listActions = {
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
            let result = await this.execute(str, true)
            return result
          },
          'setposition': async (l) => {
            this._handler.x = l[0]
            this._handler.y = l[1]
          }
        }
        
        this._putToStack(parameters[0].toLowerCase(), parameters[1])
        return await listActions[parameters[0].toLowerCase()](parameters[1])
      },
      'List': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0] ? parameters[0] : []
      },
      'ListInner': async(node) => {
        let list = []
        
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          if (child.rule.name !== 'ListInner') {
            list.push(val)
          } else {
            list = list.concat(val)
          }
        }
        
        return list
      },
      'Math': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0]
      },
      'MathGroup': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0]
      },
      'MathTerm': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0] || parameters[2]
      },
      'BoolAND': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0] && parameters[2]
      },
      'BoolNOT': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return !parameters[1]
      },
      'BoolCOMP': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
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
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0]
      },
      'DrawCommand': async (node) => {
        await a.delay(this._drawDelay)
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child, node)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let drawActions = {
          'fd': (a) => {
            this._handler.move(a)
          },
          'bk': (a) => {
            this._handler.move(-a)
          },
          'lt': (a) => {
            this._handler.turn(-a)
          },
          'rt': (a) => {
            this._handler.turn(a)
          }
        }
        drawActions['forward'] = drawActions['fd']
        drawActions['backward'] = drawActions['bk']
        drawActions['right'] = drawActions['rt']
        drawActions['left'] = drawActions['lt']
        
        this._putToStack(parameters[0].toLowerCase(), parameters[1])
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
      if (this._scopes[i].variables[str] !== undefined) 
        return this._scopes[i].variables[str]
    }
    
    throw new RuntimeError('Undefined variable "' + str + '"')
  }
  
  _setValue(str, val) {
    for (let i = this._scopes.length - 1; i >= 0; i--) {
      if (this._scopes[i].variables[str] !== undefined) {
        this._scopes[i].variables[str] = val
        return
      }
    }
    
    this._scopes[this._scopes.length - 1].variables[str] = val
  }
  
  _putToStack(name, parameters) {
    this._scopes[this._scopes.length - 1].stack.push({
      name, parameters
    })
  }
  
  _getStackTrace() {
    return this._scopes[this._scopes.length - 1].stack
  }
  
  async executeOne(node, parent) {
    await a.delay(this._executionDelay)
    if (!this._executing) {
      return {
        return: true,
        value: null
      }
    }

    if (this._actions[node.rule.name]) {
      return await this._actions[node.rule.name](node, parent)
    } else if (node.rule.class){
      if (this._parses[node.rule.class.name]) {
        return await this._parses[node.rule.class.name](node)
      } else {
        return node.rule.value
      }
    } else {
      return Promise.reject(new RuntimeError(
        'Unimplemented procedure "' + node.rule.name + '"',
        node.position
      ))
    }
  }
  
  async execute(code, noreset = false) {
    if (!noreset) {
      this._scopes = [{
        variables: {},
        stack: []
      }]
    }
    
    if (this._executing && !noreset) {
      return new RuntimeError('Execution in progress')
    } else {
      if (!noreset) this._executing = true
      let ast = this.buildAST(code)
      let ret = await this.executeOne(ast[0])
      if (!noreset) this._executing = false
      return ret
    }
  }
  
  async terminate() {
    this._executing = false
  }
}

module.exports = Logo