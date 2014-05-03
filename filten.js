if(typeof jQuery == 'undefined')
	console.warn("FiltEn requires jQuery library which was not loaded.");
else if(typeof ko == 'undefined')
	console.warn("FiltEn requires KnockoutJS library which was not loaded.");
else
$(function(){

var FiltenVM = function(filtenCriteriaOptions) {
    var self = this;

    self.items = [];
    self.criteria = {};
	
	self.itemCountDOM = $('.filten-item-count');
	self.visibleCountDOM = $('.filten-visible-count');

	// called when a criterion value is selected or deselected
    self.valueSelectionCB = function () {
        // determine which criteria have active filter values
        // gather active filter values for each criterion
        var activeCriteria = [];
        for (var i = -1, criteriaKeys = Object.keys(self.criteria); ++i < criteriaKeys.length;) {
            var criterion = self.criteria[criteriaKeys[i]];
            var activeCriteriaValues = [];
            for (var j = -1, criterionValueKeys = Object.keys(criterion.values); ++j < criterionValueKeys.length;) {
                var value = criterion.values[criterionValueKeys[j]];
                if (value.active()) activeCriteriaValues.push(value);
            }
            if (activeCriteriaValues.length > 0) activeCriteria.push(activeCriteriaValues);
        }

        // criteria results are INTERSECTED, criterion values are UNIONED

        // determine which items are visible (start with all items, then INTERSECT filtered criteria)
        var visibleProducts = self.items.slice();
        $.each(activeCriteria, function (i, activeCriterion) {
            var criterionUnionedProducts = [];
            $.each(activeCriterion, function (i, activeValue) {
                $.each(activeValue.items, function (j, item) {
                    // add to union (OR)
                    if (criterionUnionedProducts.indexOf(item) < 0) criterionUnionedProducts.push(item);
                });
            });
            // intersect with previous results (AND)
            var len = visibleProducts.length;
            while (len--) {
                // if item didn't satisfy this criterion, remove it from list
                if (criterionUnionedProducts.indexOf(visibleProducts[len]) < 0) visibleProducts.splice(len, 1);
            }
        });

        // update item visibility
        $.each(self.items, function (j, item) {
			item.setVisible(visibleProducts.indexOf(item) >= 0);
        });
		
		// update visible count
		self.visibleCountDOM.text(visibleProducts.length);
    };

    // INITIALIZATION
	
	// load options (if present)
	var options = filtenCriteriaOptions || {};
	
	// temporary structure to store criterion while parsing items
	var criteriaMap = {};

    $('.filten-item').each(function (i, v) {
        var item = new ProductModel(v);
        self.items.push(item);
		
        $.each(item.criteria, function (criterionKey, rawValue) {
			// lookup existing criterion, or create if it doesn't exist yet
			if(!criteriaMap[criterionKey])
				criteriaMap[criterionKey] = new CriterionModel(criterionKey, options[criterionKey.toLowerCase()], self.valueSelectionCB);
			// parse the item's rawValue for this criterion
			criteriaMap[criterionKey].parseProduct(item, rawValue);
        });
    });
	
	// refine criteria based on type/options
	// build an array of CriterionModels from criteriaMap
	self.criteria = $.map(criteriaMap, function (criterion) {
		criterion.finalize();
		return criterion;
	}).sort(function(a,b){return a.options.criteriaSortOrder - b.options.criteriaSortOrder;});
		
	self.itemCountDOM.text(self.items.length);
	
	self.valueSelectionCB();
};

var CriterionModel = function (criterionName, options, valueSelectionCB) {
    var self = this;

    self.name = criterionName;
	self.valueMap = {}; // becomes null after finalization, use values array instead
	self.valueSelectionCB = valueSelectionCB;
	
	if(options) console.log("Found FiltEn options for '" + criterionName + "'");
	// setup default options
	self.options = options || {};
	self.options.asRange = self.options.asRange || false;
    // self.options.delimeter
	self.options.formatValue = self.options.formatValue || function(value) {
		return value;
	};
	self.options.valueSort = self.options.valueSort || function(a,b) {
		var A = (typeof a == "string") ? a.name.toUpperCase() : a.name;
		var B = (typeof b == "string") ? b.name.toUpperCase() : b.name;
		return (A < B) ? -1 : (A > B) ? 1 : 0;
	};
	self.options.preProcess = self.options.preProcess || function(value) {
		return value.trim();
	}
	if(typeof self.options.criteriaSortOrder === 'undefined')
		self.options.criteriaSortOrder = 999;
	self.options.displayName = self.options.displayName || criterionName;
	
	self.parseProduct = function(item, rawValue) {
		var values = [];
		// if delimeter option is given, split each value into multiple values with the delimeter
		if(self.options.delimeter)
			values = rawValue.split(self.options.delimeter);
		else
			values.push(rawValue);
		
		// sanitize values and associate item with each of its values for this criterion
		for(var i=-1; ++i<values.length;) {
			var value = values[i];
			
			// remove HTML comments
			if(typeof value == 'string')
				value = value.replace(/<!--[\s\S]*?-->/g, "");
			
			// preprocess value
			if(self.options.preProcess)
				value = self.options.preProcess(value);
				
			// associate item with this criterion value (ignore empty string values)
			if(typeof value != 'string' || value.length > 0) {
				if(!self.valueMap[value]) 
					self.valueMap[value] = new CriterionValueModel(value, self.valueSelectionCB, self.options.preProcess);
				self.valueMap[value].addProduct(item);
			}
		}
	};
	
	// called when all values/items have been added, perform any pre-render processing
	self.finalize = function() {
		self.values = $.map(self.valueMap,function(value) {
			return value;
		});
		
		// if there are only 1 or fewer values, don't need to 
		// convert to range values (determine ranges and use them as the new values; map the existing values onto them)
		if(self.options.asRange && self.values.length > 1) {
			var singularValues = Object.keys(self.valueMap);
		
			var rangeValues = [];
			
			// if there are only 1 or fewer values, there is no range to determine
			if(singularValues.length > 1) {
				var low = Math.min.apply(Math, singularValues);
				var high = Math.max.apply(Math, singularValues);
				var scale = Math.pow(10,Math.ceil(Math.log(high - low) / Math.log(10)) - 1);
				var lowest = Math.floor(low / scale) * scale;
				var highest = Math.ceil(high / scale) * scale;
				
				// create new set of values based on ranges, associating the old values' items with the new set of values(ranges)
				for(var i = lowest; i < highest; i = i+scale) {
					var range = {lower:i, upper:i+scale};
					var rangeValueModel = new CriterionValueModel(self.options.formatValue(range.lower) + " - " + self.options.formatValue(range.upper), self.valueSelectionCB);
					// need to alse remember the range so we can test other values later
					rangeValueModel.range = range;
					
					// loop through unmatched singular values to determine if they fall within the current
					// if so, add their items to that range's value model
					var len = singularValues.length;
					while(len--) {
						var value = singularValues[len];
						// lower < value <= upper
						if(value > rangeValueModel.range.lower && value <= rangeValueModel.range.upper) {
							// add the singular value's items to the current range value
							for(var j=-1; ++j<self.valueMap[value].items.length;)
								rangeValueModel.addProduct(self.valueMap[value].items[j]);
								
							// remove this singular value since we've found it's match
							singularValues.splice(len,1);
						}
					};
					
					if(rangeValueModel.items.length > 0)
						rangeValues.push(rangeValueModel);
					
					self.values = rangeValues;
				}
			}
		}
		// if not a range criteria, just sort the values
		else {
			self.values.sort(self.options.valueSort);
		}
		
		self.valueMap = null;
	};
};

var CriterionValueModel = function (valueName, valueSelectionCB) {
    var self = this;
	
    self.name = valueName;
    self.items = [];
    self.active = ko.observable(false);

    self.addProduct = function(item) {
        self.items.push(item);
    };

    self.itemCount = function() {
        return self.items.length;
    };

    self.toggleActive = function() {
        self.active(!self.active());
    };

    self.active.subscribe(valueSelectionCB);
};

var ProductModel = function (itemDOM) {
    var self = this;

    var $item = $(itemDOM);
    self.dom = $item;

    self.criteria = {};
    self.multifilters = {};
    $.each($item.data(), function (k, v) {
		// .data() returns keys in camel case
        if (/^filten/.test(k)) self.criteria[k.substring(6)] = v; // remove "filten-" prefix
    });

	self.setVisible = function(visible){
        if(visible) self.dom.removeClass('filten-item-filtered');
        else self.dom.addClass('filten-item-filtered');
	};
};

var target = document.getElementById('filten');

$('.filten').each(function(){
	var $filten = $(this);
	$filten.addClass("filten-wrapper");
	$filten.append('<div class="filten-header"><div class="filten-title">Filter Results</div><div class="filten-summary"><div class="filten-summary-counts">showing <span class="filten-visible-count"></span> of <span class="filten-item-count"></span></div></div></div><div class="filten-container" data-bind="foreach: criteria"><div class="filten-crit"><div class="filten-crit-header" data-bind="text: options.displayName"></div><!-- ko foreach: values --><div class="filten-crit-value" data-bind="css: {\'filten-active\': active}, click: toggleActive"><div class="filten-crit-value-checkbox"></div><span data-bind="text: name"></span> <span class="filten-crit-value-count">(<span data-bind="text: itemCount()"></span>)</span></div><!-- /ko --></div></div>');
	ko.applyBindings(new FiltenVM(filtenCriteriaOptions), this);
	$filten.show();
});


});