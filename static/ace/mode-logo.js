const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'
const spec = '\\\\.,\\/#!$%@&<>\\^\\*;:{}=\\-\\+_`~()\'"'

ace.define(
  "ace/mode/logo_highlight_rules",
  [
    "require","exports","module",
    "ace/lib/oop","ace/mode/text_highlight_rules"
  ], 
  function(require, exports, module) {
    "use strict";

    var oop = require("../lib/oop");
    var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;
    
    var LogoHighlightRules = function() {
        this.$rules = {
            "start" : [
                {
                    token : "keyword.control",
                    regex : /(?:\b)(?:to)(?!\w)/,
                    caseInsensitive: true,
                    next: "userdefined"
                },
                {
                    token : "comment.line.double-slash",
                    regex : /(?:\/\/.*$)/,
                    caseInsensitive: true
                },
                {
                    token : "keyword.control",
                    regex : /(?:\b)(?:end|if|for|stop|output|thing|item|member\?|list\?|number\?|word\?|empty\?|shown\?|run)(?!\w)/,
                    caseInsensitive: true
                },
                {
                    token : "keyword.operator",
                    regex : /(?:\b)(?:not|and|or|integer|int|abs|sin|cos|tan|arcsin|arccos|arctan|exp|log10|log|random|round|sqrt|power|pow|uppercase|lowercase|count)(?!\w)/,
                    caseInsensitive: true
                },
                {
                    token : "keyword.operator",
                    regex : /(?:[+-/*%<>]|==|!=|>=|<=)/,
                    caseInsensitive: true
                },
                {
                    token : "support.funcion",
                    regex : /(?:\b)(?:fd|forward|bk|backward|rt|right|lt|left|firstput|lastput|make|local|setpencolor|setpenwidth|setpen|setpc|towards|print|list|word|sentence|first|last|butfirst|butlast|setposition|wait|setx|sety|setheading|repeat|date|time|heading|hideturtle|showturtle|position|xpos|ypos|home|clean|clearscreen|cs|pendown|pd|penup|pu|penwidth|pencolor|pc|pen)(?!\w)/,
                    caseInsensitive: true
                },
                {
                    token : "support.constant",
                    regex : /(?:\b)(?:pi|e)(?!\w)/,
                    caseInsensitive: true
                },
                {
                    token : "support.constant",
                    regex : /(?:[()\[\]])/,
                    caseInsensitive: true
                },
                {
                    token : "constant.language",
                    regex : /(?:\b)(?:true|false)(?!\w)/,
                    caseInsensitive: true
                },
                {
                    token : "constant.numeric",
                    regex : /(?:[0-9]+\.[0-9]+)(?![0-9]*\.[0-9]*)/
                },
                {
                    token : "constant.numeric",
                    regex : /(?:[0-9]+)(?![0-9]*\.[0-9]+)/
                },
                {
                    token : "string.quoted",
                    regex : new RegExp('(?:"[a-z' + acc + spec + '0-9]*)'),
                    caseInsensitive: true
                },
                {
                    token : "string.unquoted",
                    regex : new RegExp('(?:[a-z' + acc + '0-9]+)'),
                    caseInsensitive: true
                },
                {
                    token : "variable.other",
                    regex : new RegExp('(?::[a-z' + acc + '0-9]+)'),
                    caseInsensitive: true
                }
            ],
            "userdefined": [
              {
                  token : "entity.name.function",
                  regex : new RegExp('(?:[a-z' + acc + '0-9]+)'),
                  caseInsensitive: true,
                  next: "parameters"
              }
            ],
            "parameters": [
              {
                  token : "variable.parameter",
                  regex : new RegExp('(?::[a-z' + acc + '0-9]+)'),
                  caseInsensitive: true
              },
              {
                  token : "text",
                  regex : /(?:\s*)(?!\s*:[a-z' + acc + '0-9]+)/,
                  next: "start"
              }
            ]
        };
        
        this.normalizeRules();
    };

    LogoHighlightRules.metaData = {
        fileTypes: ['logo'],
        name: 'Logo'
    };

    oop.inherits(LogoHighlightRules, TextHighlightRules);

    exports.LogoHighlightRules = LogoHighlightRules;
  }
);

ace.define("ace/mode/logo",
  [
    "require","exports","module",
    "ace/lib/oop","ace/mode/text","ace/mode/logo_highlight_rules"
  ], 
  function(require, exports, module) {
    "use strict";

    var oop = require("../lib/oop");
    var TextMode = require("./text").Mode;
    var LogoHighlightRules = require("./logo_highlight_rules").LogoHighlightRules;

    var Mode = function() {
        this.HighlightRules = LogoHighlightRules;
        this.$behaviour = this.$defaultBehaviour;
    };
    oop.inherits(Mode, TextMode);

    (function() {
        this.lineCommentStart = "//";
        this.$id = "ace/mode/logo";
    }).call(Mode.prototype);

    exports.Mode = Mode;
  }
);
