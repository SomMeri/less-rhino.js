var tree = require("../tree"),
    Visitor = require("./visitor");

var ToCSSVisitor = function(context) {
    this._visitor = new Visitor(this);
    this._context = context;
};

ToCSSVisitor.prototype = {
    isReplacing: true,
    run: function (root) {
        return this._visitor.visit(root);
    },

    visitRule: function (ruleNode, visitArgs) {
        if (ruleNode.variable) {
            return;
        }
        return ruleNode;
    },

    visitMixinDefinition: function (mixinNode, visitArgs) {
        // mixin definitions do not get eval'd - this means they keep state
        // so we have to clear that state here so it isn't used if toCSS is called twice
        mixinNode.frames = [];
    },

    visitExtend: function (extendNode, visitArgs) {
    },

    visitComment: function (commentNode, visitArgs) {
        if (commentNode.isSilent(this._context)) {
            return;
        }
        return commentNode;
    },

    visitMedia: function(mediaNode, visitArgs) {
        mediaNode.accept(this._visitor);
        visitArgs.visitDeeper = false;

        if (!mediaNode.rules.length) {
            return;
        }
        return mediaNode;
    },

    visitDirective: function(directiveNode, visitArgs) {
        if (directiveNode.name === "@charset") {
            if (!directiveNode.getIsReferenced()) {
                return;
            }
            // Only output the debug info together with subsequent @charset definitions
            // a comment (or @media statement) before the actual @charset directive would
            // be considered illegal css as it has to be on the first line
            if (this.charset) {
                if (directiveNode.debugInfo) {
                    var comment = new tree.Comment("/* " + directiveNode.toCSS(this._context).replace(/\n/g, "") + " */\n");
                    comment.debugInfo = directiveNode.debugInfo;
                    return this._visitor.visit(comment);
                }
                return;
            }
            this.charset = true;
        }
        if (directiveNode.rules && directiveNode.rules.rules) {
            this._mergeRules(directiveNode.rules.rules); //TODO: this needed bc it is directiveNode.rules.root is true
            //process childs
            // <- if directiveNode.rules.root is false then ruleset unpacks itself and replaces itself by whatever is its content;
            // basically to css needs to treat this as top ruleset <- and maybe not

            directiveNode.rules.root = false;
            directiveNode.rules.inDirective = true;
            directiveNode.accept(this._visitor);

            visitArgs.visitDeeper = false;

            // the directive was directly referenced and therefore needs to be shown in the output
            if (directiveNode.getIsReferenced()) {
                return directiveNode;
            }
            // a directive with an empty body does not need to be in output
            //FIXME: at this point, rules can be an array - review following code too
            if (!directiveNode.rules.rules) {
                return ;
            }

            //the directive was not directly referenced
            var containsReferencedRuleset = false;
            if (directiveNode.rules.getIsReferenced && directiveNode.rules.getIsReferenced()) {
                containsReferencedRuleset = true;
            }
            if (!containsReferencedRuleset) {
                for (var r = 0; r < directiveNode.rules.rules.length && !containsReferencedRuleset; r++) {
                    var rule = directiveNode.rules.rules[r];
                    if (rule.getIsReferenced && rule.getIsReferenced()) {
                        //the directive contains something that was referenced (likely by extend)
                        //therefore it needs to be shown in output too
                        containsReferencedRuleset = true;
                    }
                }
            }
            if (containsReferencedRuleset) {
                //marking as referenced in case the directive is stored inside another directive
                directiveNode.markReferenced();
                return directiveNode;
            }

            //The directive was not directly referenced and does not contain anything that
            //was referenced. Therefore it must not be shown in output.
            return ;
        } else {
            if (!directiveNode.getIsReferenced()) {
                return;
            }
        }
        return directiveNode;
    },

    checkPropertiesInRoot: function(rules) {
        var ruleNode;
        for (var i = 0; i < rules.length; i++) {
            ruleNode = rules[i];
            if (ruleNode instanceof tree.Rule && !ruleNode.variable) {
                throw { message: "properties must be inside selector blocks, they cannot be in the root.",
                    index: ruleNode.index, filename: ruleNode.currentFileInfo ? ruleNode.currentFileInfo.filename : null};
            }
        }
    },

    visitRuleset: function (rulesetNode, visitArgs, code) {  //FIXME: remove this code from everywhere
        var rule, rulesets = [];
        if (code === 4) {
            console.log('');
        }
        if (rulesetNode.firstRoot) {
            this.checkPropertiesInRoot(rulesetNode.rules);
        }
        if (! rulesetNode.root) {
            if (rulesetNode.paths) {
                rulesetNode.paths = rulesetNode.paths
                    .filter(function(p) {
                        var i;
                        if (p[0].elements[0].combinator.value === ' ') {
                            p[0].elements[0].combinator = new(tree.Combinator)('');
                        }
                        for (i = 0; i < p.length; i++) {
                            if (p[i].getIsReferenced() && p[i].getIsOutput()) {
                                return true;
                            }
                        }
                        return false;
                    });
            }

            // Compile rules and rulesets
            var nodeRules = rulesetNode.rules, nodeRuleCnt = nodeRules ? nodeRules.length : 0;
            for (var i = 0; i < nodeRuleCnt; ) {
                rule = nodeRules[i];
                if (rule && rule.rules) {
                    // visit because we are moving them out from being a child
                    var replacement = this._visitor.visit(rule);
                    if (Array.isArray(replacement)) {
                        for (var q = 0; q < replacement.length; q++) {
                            rulesets.push(replacement[q]);
                        }
                    } else {
                        rulesets.push(replacement); //FIXME: maybe flatten here too - done up.
                    }
                    nodeRules.splice(i, 1);
                    nodeRuleCnt--;
                    continue;
                }
                i++;
            }
            // accept the visitor to remove rules and refactor itself
            // then we can decide now whether we want it or not
            if (nodeRuleCnt > 0) {
                rulesetNode.accept(this._visitor);
            } else {
                rulesetNode.rules = null;
            }
            visitArgs.visitDeeper = false;

            nodeRules = rulesetNode.rules;
            if (nodeRules) {
                this._mergeRules(nodeRules);
                nodeRules = rulesetNode.rules;
            }
            if (nodeRules) {
                this._removeDuplicateRules(nodeRules);
                nodeRules = rulesetNode.rules;
            }

            // now decide whether we keep the ruleset
            //FIXME: this used to check paths too && rulesetNode.paths && rulesetNode.paths.length > 0 WHY?
            // <- possible answer: becaues genCSS in ruleset fails afterwards
            // on TypeError: Cannot read property 'length' of undefined
            // Real reason: import (reference) ruleset has empty paths and that is how it is recognized.
            // e.g. paths availability can not be the thing that distinguishes visible and invisible rulesets
            if (nodeRules && nodeRules.length > 0 && (rulesetNode.inDirective || (rulesetNode.paths && rulesetNode.paths.length > 0)) ) {
                rulesets.splice(0, 0, rulesetNode);
            }
        } else {
            rulesetNode.accept(this._visitor);
            visitArgs.visitDeeper = false;
            if (rulesetNode.firstRoot || (rulesetNode.rules && rulesetNode.rules.length > 0)) {
                rulesets.splice(0, 0, rulesetNode);
            }
        }
        if (rulesets.length === 1) {
            return rulesets[0];
        }
        return rulesets;
    },

    _removeDuplicateRules: function(rules) {
        if (!rules) { return; }

        // remove duplicates
        var ruleCache = {},
            ruleList, rule, i;

        for (i = rules.length - 1; i >= 0 ; i--) {
            rule = rules[i];
            if (rule instanceof tree.Rule) {
                if (!ruleCache[rule.name]) {
                    ruleCache[rule.name] = rule;
                } else {
                    ruleList = ruleCache[rule.name];
                    if (ruleList instanceof tree.Rule) {
                        ruleList = ruleCache[rule.name] = [ruleCache[rule.name].toCSS(this._context)];
                    }
                    var ruleCSS = rule.toCSS(this._context);
                    if (ruleList.indexOf(ruleCSS) !== -1) {
                        rules.splice(i, 1);
                    } else {
                        ruleList.push(ruleCSS);
                    }
                }
            }
        }
    },

    _mergeRules: function (rules) {
        if (!rules) { return; }

        var groups = {},
            parts,
            rule,
            key;

        for (var i = 0; i < rules.length; i++) {
            rule = rules[i];

            if ((rule instanceof tree.Rule) && rule.merge) {
                key = [rule.name,
                    rule.important ? "!" : ""].join(",");

                if (!groups[key]) {
                    groups[key] = [];
                } else {
                    rules.splice(i--, 1);
                }

                groups[key].push(rule);
            }
        }

        Object.keys(groups).map(function (k) {

            function toExpression(values) {
                return new (tree.Expression)(values.map(function (p) {
                    return p.value;
                }));
            }

            function toValue(values) {
                return new (tree.Value)(values.map(function (p) {
                    return p;
                }));
            }

            parts = groups[k];

            if (parts.length > 1) {
                rule = parts[0];
                var spacedGroups = [];
                var lastSpacedGroup = [];
                parts.map(function (p) {
                    if (p.merge === "+") {
                        if (lastSpacedGroup.length > 0) {
                            spacedGroups.push(toExpression(lastSpacedGroup));
                        }
                        lastSpacedGroup = [];
                    }
                    lastSpacedGroup.push(p);
                });
                spacedGroups.push(toExpression(lastSpacedGroup));
                rule.value = toValue(spacedGroups);
            }
        });
    }
};

module.exports = ToCSSVisitor;
