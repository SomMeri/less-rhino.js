var Node = require("./node"),
    Ruleset = require("./ruleset"),
    Selector = require("./selector");

var Directive = function (name, value, rules, index, currentFileInfo, debugInfo, isReferenced) {
    console.log("creating directive " + rules);
    if (rules) {
        console.log("* creating directive " + rules.type);
    }
    this.name  = name;
    this.value = value;
    if (rules) {
        if (!rules.selectors) {
            rules.selectors = (new Selector([], null, null, this.index, this.currentFileInfo)).createEmptySelectors();
        }
        if (Array.isArray(rules)) {
            console.log("111111111111111111111111111111111111111111111111");
        }
        this.rules = rules;
        this.rules.allowImports = true;
    }
    this.index = index;
    this.currentFileInfo = currentFileInfo;
    this.debugInfo = debugInfo;
    this.isReferenced = isReferenced;
};

Directive.prototype = new Node();
Directive.prototype.type = "Directive";
var totalCounter = 0;
Directive.prototype.accept = function (visitor) {
    var value = this.value, rules = this.rules;
    var code = totalCounter++;
    if (rules) {
        console.log("Before visitor isArray: " + Array.isArray(this.rules) + " ("  + code + ")");
        this.rules = visitor.visit(rules, code);
        console.log("After visitor isArray: " + Array.isArray(this.rules) + " ("  + code + ")");
        if (Array.isArray(this.rules)) {
            console.log("222222222222222222222222222222222222222222222222222 " + " ("  + code + ")");
            var secondResult = visitor.visit(rules);
            console.log("Second attempt: " + Array.isArray(secondResult) + " ("  + code + ")");
        }
    }
    if (value) {
        this.value = visitor.visit(value);
    }
};
Directive.prototype.isRulesetLike = function() {
    return this.rules || !this.isCharset();
};
Directive.prototype.isCharset = function() {
    return "@charset" === this.name;
};
Directive.prototype.genCSS = function (context, output) {
    var value = this.value, rules = this.rules;
    output.add(this.name, this.currentFileInfo, this.index);
    if (value) {
        output.add(' ');
        console.log("genCss directive value: " + value.value);
        value.genCSS(context, output);
    }
    if (rules) {
        console.log("genCss rules type: " + rules.type);
        if (!rules.type) {
            console.log("* genCss rules isArray: " + Array.isArray(rules));
        }
        console.log("genCss rules length 1: " + rules.length);
        if (rules.type === "Ruleset") {
            rules = [rules];
        }
        if (rules.type === "Media") {
            console.log("either should not happen or I need to find out why it happens");
            rules = [rules];
        }
        if (rules.type === "Directive") {
            console.log("either should not happen or I need to find out why it happens");
            rules = [rules];
        }
        console.log("genCss rules length 2: " + rules.length);
        this.outputRuleset(context, output, rules);
    } else {
        output.add(';');
    }
};
Directive.prototype.eval = function (context) {
    var value = this.value, rules = this.rules;

    var mediaPathBackup = context.mediaPath;
    var mediaBlocksBackup = context.mediaBlocks;

    context.mediaPath = [];
    context.mediaBlocks = [];

    if (value) {
        value = value.eval(context);
        console.log("eval directive value: " + value.value);
    }
    if (rules) {
        rules = rules.eval(context);
        console.log("evaluated rules: " + rules.type);
        rules.root = true;
        //if (context.mediaBlocks && context.mediaBlocks.length > 1) {
        //    console.log("context.mediaBlocks are existing");
        //    rules = context.mediaBlocks;
        //}
    }
    context.mediaPath = mediaPathBackup;
    context.mediaBlocks = mediaBlocksBackup;

    return new Directive(this.name, value, rules,
        this.index, this.currentFileInfo, this.debugInfo, this.isReferenced);
};
Directive.prototype.variable = function (name) {
    if (this.rules) {
        return Ruleset.prototype.variable.call(this.rules, name);
    }
};
Directive.prototype.find = function () {
    if (this.rules) {
        return Ruleset.prototype.find.apply(this.rules, arguments);
    }
};
Directive.prototype.rulesets = function () {
    if (this.rules) {
        return Ruleset.prototype.rulesets.apply(this.rules);
    }
};
Directive.prototype.markReferenced = function () {
    var i, rules;
    this.isReferenced = true;
    if (this.rules) {
        rules = this.rules.rules;
        for (i = 0; i < rules.length; i++) {
            if (rules[i].markReferenced) {
                rules[i].markReferenced();
            }
        }
    }
};
Directive.prototype.getIsReferenced = function () {
    return !this.currentFileInfo || !this.currentFileInfo.reference || this.isReferenced;
};
Directive.prototype.outputRuleset = function (context, output, rules) {
    var ruleCnt = rules.length, i;
    context.tabLevel = (context.tabLevel | 0) + 1;

    // Compressed
    if (context.compress) {
        output.add('{');
        for (i = 0; i < ruleCnt; i++) {
            rules[i].genCSS(context, output);
        }
        output.add('}');
        context.tabLevel--;
        return;
    }

    // Non-compressed
    var tabSetStr = '\n' + Array(context.tabLevel).join("  "), tabRuleStr = tabSetStr + "  ";
    if (!ruleCnt) {
        output.add(" {" + tabSetStr + '}');
    } else {
        output.add(" {" + tabRuleStr);
        rules[0].genCSS(context, output);
        for (i = 1; i < ruleCnt; i++) {
            output.add(tabRuleStr);
            if (!rules[i].genCSS) {
                console.log("WROOOOOOOOOOOOOOONG: " + rules[i].type + " isArray: " + Array.isArray(rules[i]));
            }
            rules[i].genCSS(context, output);
        }
        output.add(tabSetStr + '}');
    }

    context.tabLevel--;
};
module.exports = Directive;
