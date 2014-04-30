if(typeof jQuery == 'undefined')
	console.warn("FiltEn requires jQuery library which was not loaded.");
else if(typeof ko == 'undefined')
	console.warn("FiltEn requires KnockoutJS library which was not loaded.");
else
$(function(){

var ProductVM = function(productsSelector, filtenCriteriaOptions) {
    var self = this;

    self.products = [];
    self.criteria = {};
	
	self.visibleCount = ko.observable(0);

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

        // determine which products are visible (start with all products, then INTERSECT filtered criteria)
        var visibleProducts = self.products.slice();
        $.each(activeCriteria, function (i, activeCriterion) {
            var criterionUnionedProducts = [];
            $.each(activeCriterion, function (i, activeValue) {
                $.each(activeValue.products, function (j, product) {
                    // add to union (OR)
                    if (criterionUnionedProducts.indexOf(product) < 0) criterionUnionedProducts.push(product);
                });
            });
            // intersect with previous results (AND)
            var len = visibleProducts.length;
            while (len--) {
                // if product didn't satisfy this criterion, remove it from list
                if (criterionUnionedProducts.indexOf(visibleProducts[len]) < 0) visibleProducts.splice(len, 1);
            }
        });

        // update product visibility
        $.each(self.products, function (j, product) {
            product.visible(visibleProducts.indexOf(product) >= 0);
        });
		
		self.visibleCount(visibleProducts.length);
    };

    // INITIALIZATION
	
	// load options (if present)
	var options = filtenCriteriaOptions || {};
	
	// temporary structure to store criterion while parsing products
	var criteriaMap = {};

    $(productsSelector).each(function (i, v) {
        var product = new ProductModel(v);
        self.products.push(product);
		
        $.each(product.criteria, function (criterionKey, rawValue) {
			// lookup existing criterion, or create if it doesn't exist yet
			if(!criteriaMap[criterionKey])
				criteriaMap[criterionKey] = new CriterionModel(criterionKey, options[criterionKey.toLowerCase()], self.valueSelectionCB);
			// parse the product's rawValue for this criterion
			criteriaMap[criterionKey].parseProduct(product, rawValue);
        });
    });
	
	// refine criteria based on type/options
	// build an array of CriterionModels from criteriaMap
	self.criteria = $.map(criteriaMap, function (criterion) {
		criterion.finalize();
		return criterion;
	}).sort(function(a,b){return a.options.criteriaSortOrder - b.options.criteriaSortOrder;});
	
	self.visibleCount(self.products.length);
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
	if(typeof self.options.criteriaSortOrder === 'undefined')
		self.options.criteriaSortOrder = 999;
	self.options.displayName = self.options.displayName || criterionName;
	
	self.parseProduct = function(product, rawValue) {
		var values = [];
		// if delimeter option is given, split each value into multiple values with the delimeter
		if(self.options.delimeter)
			values = rawValue.split(self.options.delimeter);
		else
			values.push(rawValue);
		
		// associate product with each of its values for this criterion
		for(var i=-1; ++i<values.length;) {
			var value = values[i];
			if(!self.valueMap[value])
				self.valueMap[value] = new CriterionValueModel(value, self.valueSelectionCB);
			self.valueMap[value].addProduct(product);
		}
	};
	
	// called when all values/products have been added, perform any pre-render processing
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
				
				// create new set of values based on ranges, associating the old values' products with the new set of values(ranges)
				for(var i = lowest; i < highest; i = i+scale) {
					var range = {lower:i, upper:i+scale};
					var rangeValueModel = new CriterionValueModel(self.options.formatValue(range.lower) + " - " + self.options.formatValue(range.upper), self.valueSelectionCB);
					// need to alse remember the range so we can test other values later
					rangeValueModel.range = range;
					
					// loop through unmatched singular values to determine if they fall within the current
					// if so, add their products to that range's value model
					var len = singularValues.length;
					while(len--) {
						var value = singularValues[len];
						// lower < value <= upper
						if(value > rangeValueModel.range.lower && value <= rangeValueModel.range.upper) {
							// add the singular value's products to the current range value
							for(var j=-1; ++j<self.valueMap[value].products.length;)
								rangeValueModel.addProduct(self.valueMap[value].products[j]);
								
							// remove this singular value since we've found it's match
							singularValues.splice(len,1);
						}
						
						//if(!self.valueMap[value])
						//	self.valueMap[value] = new CriterionValueModel(value, self.valueSelectionCB);
						//self.valueMap[value].addProduct(product);
					};
					
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
    self.products = [];
    self.active = ko.observable(false);

    self.addProduct = function(product) {
        self.products.push(product);
    };

    self.count = function() {
        return self.products.length;
    };

    self.countVisible = function() {
        var count = 0;
        for (var i = 0; i < self.products.length; i++)
            if (self.products[i].visible()) count++;
        return count;
    };

    self.toggleActive = function() {
        self.active(!self.active());
    };

    self.active.subscribe(valueSelectionCB);
};

var ProductModel = function (productDOM) {
    var self = this;

    var $product = $(productDOM);
    self.dom = $product;
    self.visible = ko.observable(true);

    self.criteria = {};
    self.multifilters = {};
    $.each($product.data(), function (k, v) {
		// .data() returns keys in camel case
        if (/^filtenCrit/.test(k)) self.criteria[k.substring(10)] = v; // remove "filten-crit-" prefix
    });

    self.visible.subscribe(function (newVisibility) {
        if (newVisibility) self.dom.show();
        else self.dom.hide();
    });
};

var target = document.getElementById('filten');
ko.applyBindings(new ProductVM('.filten-product', filtenCriteriaOptions), target);
$(target).show();

});