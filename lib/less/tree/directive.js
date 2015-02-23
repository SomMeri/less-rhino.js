var Node = require("./node"),
    Ruleset = require("./ruleset"),
    Selector = require("./selector");

var Directive = function (name, value, rules, index, currentFileInfo, debugInfo, isReferenced) {
    this.name  = name;
    this.value = value;
    if (rules) {
        if (!rules.selectors) {
            rules.selectors = (new Selector([], null, null, this.index, currentFileInfo)).createEmptySelectors();
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
        this.rules = visitor.visit(rules, code);
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
        value.genCSS(context, output);
    }
    if (rules) {
        if (rules.paths && rules.paths.length > 0) {
            //FIXME: this is wrong just test, do it correctly
            // problem 1 - ruleste needs NOT to be root for a change -(directive needs it not to be it is switchind constantly)
            rules.root = false;
            context.tabLevel++;
            output.add(" {\n" ); //modified fix
            rules.genCSS(context, output);
            output.add('}\n'); //modified fix
            context.tabLevel--;
        } else {
            if (!Array.isArray(rules)) {
                rules = [rules];
            }
            this.outputRuleset(context, output, rules);
        }
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
    }
    if (rules) {
        rules = rules.eval(context);
        rules.root = true;
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
            output.add('\n');
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
            rules[i].genCSS(context, output);
        }
        output.add(tabSetStr + '}');
    }

    context.tabLevel--;
};
module.exports = Directive;
