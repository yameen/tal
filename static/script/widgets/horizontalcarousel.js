/**
 * @fileOverview Requirejs module containing the antie.widgets.HorizontalCarousel class.
 *
 * @preserve Copyright (c) 2013 British Broadcasting Corporation
 * (http://www.bbc.co.uk) and TAL Contributors (1)
 *
 * (1) TAL Contributors are listed in the AUTHORS file and at
 *     https://github.com/fmtvp/TAL/AUTHORS - please extend this file,
 *     not this notice.
 *
 * @license Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * All rights reserved
 * Please contact us for an alternative licence
 */

require.def('antie/widgets/horizontalcarousel',
	[
		'antie/widgets/horizontallist',
		'antie/widgets/list',
		'antie/events/keyevent',
		'antie/events/beforeselecteditemchangeevent'
	],
	function (HorizontalList, List, KeyEvent, BeforeSelectedItemChangeEvent) {
		/**
		 * The HorizontalCarousel widget extends the HorizontalList widget to modify the animation behaviour to render a carousel rather than a list.
		 * @name antie.widgets.HorizontalCarousel
		 * @class
		 * @extends antie.widgets.HorizontalList
		 * @requires antie.widgets.List
		 * @requires antie.events.KeyEvent
		 * @param {String} [id] The unique ID of the widget. If excluded, a temporary internal ID will be used (but not included in any output).
		 * @param {antie.Formatter} [itemFormatter] A formatter class used on each data item to generate the list item child widgets.
		 * @param {antie.DataSource|Array} [dataSource] An array of data to be used to generate the list items, or an asynchronous data source.
		 */
		var HorizontalCarousel = HorizontalList.extend(/** @lends antie.widgets.HorizontalCarousel.prototype */ {
			/**
			 * @constructor
			 * @ignore
			 */
			init: function(id, itemFormatter, dataSource, overrideAnimation, activeWidgetAlignment, BeforeSelectedItemChangeEvent) {
				this._prefixCloneCount = 0;
				this._wrapMode = HorizontalCarousel.WRAP_MODE_VISUAL;
				this._viewportMode = HorizontalCarousel.VIEWPORT_MODE_NONE;
				this._viewportItemCount = 0;
				this._activateThenScroll = false;
				this._scrollHandle = null;
				this._keepHidden = false;
				this._multiWidthItems = false;
				this._overrideAnimation = overrideAnimation;
				this._activeWidgetAlignment = activeWidgetAlignment || HorizontalCarousel.ALIGNMENT_CENTER;
				this._activeWidgetAnimationFPS = 25;
				this._activeWidgetAnimationDuration = 840;
				this._activeWidgetAnimationEasing = 'easeFromTo';
				this._nodeOffset = 0;
				this._childWidgetsInDocument = [];
				this._paddingItemsCreated = false;
				this._super(id, itemFormatter, dataSource);
				this.addClass('horizontalcarousel');
				var self = this;
				this.addEventListener('databound', function (evt) {
					if (evt.target !== self) {
						return;
					}

					// Delaying this because our mask might not have a size yet. Shouldn't be a problem for dynamic data
					// source, only for static carousels (such as the menu). It's been found to need to differ on
					// devices.
					var config = self.getCurrentApplication().getDevice().getConfig();
					var delay = 100;
					if (config.widgets && config.widgets.horizontalcarousel && config.widgets.horizontalcarousel.bindDelay) {
						delay = config.widgets.horizontalcarousel.bindDelay;
					}
					setTimeout(function () { self._onDataBound(evt); }, delay);
				});
			},
			/**
			 * Renders the widget and any child widgets to device-specific output.
			 * @param {antie.devices.Device} device The device to render to.
			 * @returns A device-specific object that represents the widget as displayed on the device (in a browser, a DOMElement);
			 */
			render: function (device) {
				// keep the element hidden until data is bound and items created
				if (!this._maskElement) {
					this._maskElement = device.createContainer(this.id + '_mask', ['horizontallistmask', 'notscrolling']);
				} else {
					device.clearElement(this._maskElement);
					this._childWidgetsInDocument = [];
				}

				if (this._viewportMode !== HorizontalCarousel.VIEWPORT_MODE_DOM) {
					device.appendChildElement(this._maskElement, this._super(device));
				} else {
					if (!this._dataBound && this._dataSource && this._itemFormatter) {
						this._createDataBoundItems();
					}
					if (!this.outputElement) {
						if (this._renderMode === List.RENDER_MODE_LIST) {
							this.outputElement = device.createList(this.id, this.getClasses());
						} else {
							this.outputElement = device.createContainer(this.id, this.getClasses());
						}
					}
					device.appendChildElement(this._maskElement, this.outputElement);
				}

				// Don't hide if we're never going to databind (or it'll never be shown);
				if (this._dataSource) {
					device.hideElement({
						el: this._maskElement,
						skipAnim: true
					});
				} else {
					var self = this;
					var config = device.getConfig();
					var delay = 100;
					if (config.widgets && config.widgets.horizontalcarousel && config.widgets.horizontalcarousel.bindDelay) {
						delay = config.widgets.horizontalcarousel.bindDelay;
					}
					setTimeout(function () { self._onDataBound(); }, delay);
				}

				return this._maskElement;
			},
			refreshViewport: function () {
				var i, index, device, self;
				self = this;

				function removeElementsDefinitelyOutsideViewPortFromDOM() {
					var i, index;
					for (i = 0; i < self._childWidgetsInDocument.length; i++) {
						index = i + self._nodeOffset;
						if (index < self._selectedIndex - self._viewportItemCount || index > self._selectedIndex + self._viewportItemCount) {
							if (self._childWidgetsInDocument[i].outputElement) {
								device.removeElement(self._childWidgetsInDocument[i].outputElement);
							}
						}
					}
				}

				function indexCouldBeInViewport(i) {
					return (i <= self._selectedIndex + self._viewportItemCount) && (i < self._childWidgetOrder.length);
				}


				
				var _centerWidget = this._activeChildWidget || this._childWidgetOrder[0];
				if (!_centerWidget) {
					return;
				}

				if (this._viewportMode === HorizontalCarousel.VIEWPORT_MODE_DOM) {
					this.setAutoRenderChildren(true);

					device = this.getCurrentApplication().getDevice();

					if (!_centerWidget.outputElement) {
						_centerWidget.outputElement = _centerWidget.render(device);
					}

					// iterate through the widgets currently in the document
					// removing any that are no-longer in or near the viewport
					removeElementsDefinitelyOutsideViewPortFromDOM();

					// find the elements that are in the view port and add them
					// to the document (and keep a record of them)
					this._childWidgetsInDocument = [];
					var start, firstIndexDefinitelyOutsideViewport;
					
					firstIndexDefinitelyOutsideViewport = this._selectedIndex - this._viewportItemCount;
					start = firstIndexDefinitelyOutsideViewport < 0 ? 0 : firstIndexDefinitelyOutsideViewport;
					
					i = start;

					while (indexCouldBeInViewport(i)) {
						index = i - start + this._prefixCloneCount;

						this._childWidgetOrder[i].addClass('inviewport');
						if (!this._childWidgetOrder[i].outputElement) {
							this._childWidgetOrder[i].outputElement = this._childWidgetOrder[i].render(device);
						}
						if (!device.getElementParent(this._childWidgetOrder[i].outputElement)) {
							device.insertChildElementAt(this.outputElement, this._childWidgetOrder[i].outputElement, index);
						}
						this._childWidgetsInDocument.push(this._childWidgetOrder[i]);

						i++;
					}
					this._nodeOffset = this._selectedIndex - this._viewportItemCount;
					if (this._nodeOffset < 0) {
						this._nodeOffset = 0;
					}

					// reposition the carousel over the active item
					var elpos = device.getElementOffset(_centerWidget.outputElement);
					var elsize = device.getElementSize(_centerWidget.outputElement);
					this._alignToElement(_centerWidget.outputElement, true);
					//device.scrollElementToCenter(this._maskElement, elpos.left + (elsize.width / 2), null, true);

					this.setAutoRenderChildren(false);
				} else if((this._viewportMode == HorizontalCarousel.VIEWPORT_MODE_CLASSES) && this.outputElement && _centerWidget.outputElement) {
					device = this.getCurrentApplication().getDevice();
					var elpos = device.getElementOffset(_centerWidget.outputElement);
					var elsize = device.getElementSize(_centerWidget.outputElement);
					var maskSize = device.getElementSize(this._maskElement);
					var nodes = device.getChildElementsByTagName(this.outputElement,
							this._renderMode === List.RENDER_MODE_LIST ? 'li' : 'div'
					);

					var viewportLeft = (elpos.left + (elsize.width / 2)) - (maskSize.width / 2);
					var viewportRight = (elpos.left + (elsize.width / 2)) + (maskSize.width / 2);
					var nearViewportLeft = (elpos.left + (elsize.width / 2)) - (maskSize.width * 1.5);
					var nearViewportRight = (elpos.left + (elsize.width / 2)) + (maskSize.width * 1.5);

					var count = this._childWidgetOrder.length;

					for (i = 0; i < nodes.length; i++) {
						var node = nodes[i];
						if (!node.cloneOfWidget) {
							var w = this._childWidgetOrder[i - this._prefixCloneCount];
							if (w) {
								w.removeClass('inviewport');
								w.removeClass('nearviewport');
							}
						}
					}

					for(var i=0; i<nodes.length; i++) {
						var node = nodes[i];
						var nodepos = device.getElementOffset(node);
						var nodesize = device.getElementSize(node);
						var w = node.cloneOfWidget || this._childWidgetOrder[i - this._prefixCloneCount];
						if(!w) { continue; }

						if(((nodepos.left + nodesize.width) >= viewportLeft) && (nodepos.left < viewportRight)) {
							// work out which elements are on screen and given them a 'inviewport' class
							if(node.cloneOfWidget) {
								device.removeClassFromElement(node, 'nearviewport');
								device.addClassToElement(node, 'inviewport');
							} 
							w.removeClass('nearviewport');
							w.addClass('inviewport');
						} else if(((nodepos.left + nodesize.width) >= nearViewportLeft) && (nodepos.left < nearViewportRight)) {
							// work out which elements are near the screen, and give them a 'nearviewport' class
							if(node.cloneOfWidget) {
								device.removeClassFromElement(node, 'inviewport');
								device.addClassToElement(node, 'nearviewport');
							} 
							w.removeClass('inviewport');
							w.addClass('nearviewport');
						} else if(node.cloneOfWidget) {
							device.removeClassFromElement(node, 'inviewport');
							device.removeClassFromElement(node, 'nearviewport');
						}
					}
				}
			},
			
			/**
			 * turns animation on/off
			 * @param {Boolean} [reposition] Set to <code>true</code> if you want the carousel to animate
			 */
			setAnimationOverride : function (animationOn) {
				return this._overrideAnimation = !animationOn;
			},

			/**
			 * Attempt to set focus to the given child widget.
			 * @param {antie.widgets.Widget} widget The child widget to set focus to.
			 * @param {Boolean} [reposition] Set to <code>true</code> if you want to scroll the carousel to the new item.
			 * @returns Boolean true if the child widget was focusable, otherwise boolean false.
			 */
			setActiveChildWidget: function (widget, reposition) {
				var moved = this._super(widget);

				if (this._activeChildWidget && this.outputElement && reposition) {
					if (this._viewportMode !== HorizontalCarousel.VIEWPORT_MODE_DOM) {
						var device = this.getCurrentApplication().getDevice();
						var elpos = device.getElementOffset(this._activeChildWidget.outputElement);
						var elsize = device.getElementSize(this._activeChildWidget.outputElement);
						this._alignToElement(this._activeChildWidget.outputElement, true);
					}
					this.refreshViewport();
				}

				return moved;
			},
			/**
			 * Attempts to set focus to the child widget at the given index.
			 * @see #setActiveChildWidget
			 * @param {Integer} index Index of the child widget to set focus to.
			 * @returns Boolean true if the child widget was focusable, otherwise boolean false.
			 */
			setActiveChildIndex: function (index, reposition) {
				if(index < 0 || index >= this._childWidgetOrder.length) {
					throw new Error("HorizontalCarousel::setActiveChildIndex Index out of bounds. " + this.id + " contains " + this._childWidgetOrder.length + " children, but an index of " + index + " was specified.");
				}
				return this.setActiveChildWidget(this._childWidgetOrder[index], reposition);
			},
			setDataSource: function (data) {
				this._prefixCloneCount = 0;
				this._super(data);
			},
			rebindDataSource: function() {
				var device = this.getCurrentApplication().getDevice();
				var config = device.getConfig();
				var animate = !config.widgets || !config.widgets.horizontalcarousel || (config.widgets.horizontalcarousel.fade !== false);

				var self = this;
				var func = this._super;
				device.hideElement({
					el: this._maskElement,
					skipAnim: !animate,
					onComplete: function() {
						func.call(self);
					}
				});
			},
			/**
			 * Handle key events to scroll the carousel.
			 * @private
			 */
			_onKeyDown: function(evt) {
				// This event handler is already bound (int HorizontalList), we override it to add wrapping logic

				// Block all movement if the carousel is scrolling
				if(this._scrollHandle && (
					evt.keyCode == KeyEvent.VK_LEFT ||
					evt.keyCode == KeyEvent.VK_RIGHT ||
					evt.keyCode == KeyEvent.VK_UP ||
					evt.keyCode == KeyEvent.VK_DOWN
				)) {
					evt.stopPropagation();
					return;
				}

				switch (evt.keyCode) {
					case KeyEvent.VK_LEFT:
						if (this.selectPreviousChildWidget()) {
							evt.stopPropagation();
						}
						
						break;
					case KeyEvent.VK_RIGHT:
						if (this.selectNextChildWidget()) {
							evt.stopPropagation();
						}
						
						break;
				}
			},
			/**
			 * DataBound event handler. Clone carousel items to allow infinite scrolling.
			 * @private
			 */
			_onDataBound: function(evt) {
				function createWrappingCloneElementsAndReturnNumberOfPrefixedClones() {
					var requiredWidth, widget, clone, i, copyWidth, prefixCloneCount;

					requiredWidth = self._multiWidthItems ? maskSize.width : Math.ceil(maskSize.width / 2);

					function createClone(widget) {
						var clone;
						clone = device.cloneElement(widget.outputElement, true, "clone", "_clone");
						clone.cloneOfWidget = widget;

						if(widget.hasClass('active')) {
							device.removeClassFromElement(clone, 'active', true);
						}
						if(widget.hasClass('focus')) {
							device.removeClassFromElement(clone, 'focus', true);
							device.removeClassFromElement(clone, 'buttonFocussed', true);
						}
						return clone;
					}

					i = 0;
					copyWidth = 0;
					prefixCloneCount = 0

					while(copyWidth < requiredWidth) {

						widget = self._childWidgetOrder[i];
						clone = createClone(widget);

						device.appendChildElement(self.outputElement, clone);
						var widgetWidth = device.getElementSize(widget.outputElement).width;
						if(i === 0) {
							requiredWidth += widgetWidth;
						}
						copyWidth += widgetWidth;
						i++;
						if(i == self._childWidgetOrder.length) i = 0;
					}

					copyWidth = 0;
					i = self._childWidgetOrder.length-1;
					while(copyWidth < requiredWidth) {
						widget = self._childWidgetOrder[i];
						clone = createClone(widget);

						device.prependChildElement(self.outputElement, clone);
						copyWidth += device.getElementSize(widget.outputElement).width;
						i--;
						prefixCloneCount++;
						if(i == -1) i = self._childWidgetOrder.length-1;
					}
					return prefixCloneCount;
				}

				function addInviewportClassToAllElements() {
					var widgetIndex;
					for(widgetIndex=0; widgetIndex < self._childWidgetOrder.length; widgetIndex++) {
						self._childWidgetOrder[widgetIndex].addClass('inviewport');
					}
				}

				function createPaddingForNonWrappingCarousel() {
					if(self._paddingItemsCreated) {
						var paddingFunction = (self._renderMode == List.RENDER_MODE_LIST)
							? device.createListItem
							: device.createContainer;

						var leftPadding = paddingFunction.call(device, self.id + 'PaddingLeft', ['viewportPadding', 'viewportPaddingLeft']);
						device.setElementSize(leftPadding, {width: maskSize.width});
						device.prependChildElement(self.outputElement, leftPadding);

						var rightPadding = paddingFunction.call(device, self.id + 'PaddingRight', ['viewportPadding', 'viewportPaddingRight']);
						device.setElementSize(rightPadding, {width: maskSize.width});
						device.appendChildElement(self.outputElement, rightPadding);

						prefixClones = 1;
					}
					self._paddingItemsCreated = true;
				}

				function moveCarouselToInitialPosition() {
					if(self._activeChildWidget && (self._viewportMode != HorizontalCarousel.VIEWPORT_MODE_DOM)) {
						self._alignToElement(self._activeChildWidget.outputElement, true);
					}
				}
				var self = this;
				var application = this.getCurrentApplication();
				if(!application) {
					// application has been destroyed, abort
					return;
				}
				var device = application.getDevice();

				if(this._childWidgetOrder.length > 0) {

					var maskSize = device.getElementSize(this._maskElement);
					var prefixClones = 0;
					this._nodeOffset = 0;
					this._childWidgetsInDocument = [];

					if(this._viewportMode == HorizontalCarousel.VIEWPORT_MODE_NONE) {
						addInviewportClassToAllElements();
					}

					if(this._wrapMode != HorizontalCarousel.WRAP_MODE_VISUAL) {
						createPaddingForNonWrappingCarousel();
					} else {
						prefixClones = createWrappingCloneElementsAndReturnNumberOfPrefixedClones();
					}

					this._prefixCloneCount = prefixClones;

					moveCarouselToInitialPosition();

					this.refreshViewport();
				}

				// everything is now in place, show the carousel				
				if(!this._keepHidden) {
					var config = device.getConfig();
					var animate = !config.widgets || !config.widgets.horizontalcarousel || (config.widgets.horizontalcarousel.fade !== false);
					device.showElement({
						el: this._maskElement,
						skipAnim: !animate
					});
				}
			},
			/**
			 * Set whether to support wrapping within the carousel.
			 * @param {Integer} wrapMode 	Pass <code>HorizontalCarousel.WRAP_MODE_NONE</code> for no wrapping.
			 * 				Pass <code>HorizontalCarousel.WRAP_MODE_NAVIGATION_ONLY</code> to allow navigation to wrap.
			 * 				Pass <code>HorizontalCarousel.WRAP_MODE_VISUAL</code> to visually wrap the carousel (includes navigation).
			 */
			setWrapMode: function(wrapMode) {
				if(this._viewportMode == HorizontalCarousel.VIEWPORT_MODE_DOM) {
					if(wrapMode == HorizontalCarousel.WRAP_MODE_VISUAL) {
						throw new Error('HorizontalCarousel::setWrapMode - VIEWPORT_MODE_DOM not supported for WRAP_MODE_VISUAL');
					}
				}
				this._wrapMode = wrapMode;
			},
			/**
			 * Set method used to control which carousel items are in this rendered DOM
			 * @param {Integer} viewportMode One of <code>HorizontalCarousel.VIEWPORT_MODE_NONE</code>,
			 *							   <code>HorizontalCarousel.VIEWPORT_MODE_DOM</code> or 
			 *							   <code>HorizontalCarousel.VIEWPORT_MODE_CLASSES</code>.
			 * @param {Integer} viewportItemCount		 Number of items in the viewport.
			 */
			setViewportMode: function(viewportMode, viewportItemCount) {
				if(this._wrapMode == HorizontalCarousel.WRAP_MODE_VISUAL) {
					if(viewportMode == HorizontalCarousel.VIEWPORT_MODE_DOM) {
						throw new Error('HorizontalCarousel::setViewportMode - VIEWPORT_MODE_DOM not supported for WRAP_MODE_VISUAL');
					}
				}
				if(viewportMode == HorizontalCarousel.VIEWPORT_MODE_DOM) {
					if(!viewportItemCount) {
						throw new Error('HorizontalCarousel::setViewportMode - You must specify a viewport size when using VIEWPORT_MODE_DOM');
					}
					this.setAutoRenderChildren(false);
				} else {
					this.setAutoRenderChildren(true);
				}
				this._viewportMode = viewportMode;
				this._viewportItemCount = viewportItemCount;
			},
			/**
			 * Set the alignment of the active item.
			 * @param {Integer} align		One of <code>HorizontalCarousel.ALIGNMENT_CENTER</code> (default),
			 *							   <code>HorizontalCarousel.ALIGNMENT_LEFT</code> or 
			 *							   <code>HorizontalCarousel.ALIGNMENT_RIGHT</code>.
			 */
			setAlignment: function (align) {
				this._activeWidgetAlignment = align;  
			},
			/**
			 * Get the current alignment of the active item.
			 * @returns {Integer} One of <code>HorizontalCarousel.ALIGNMENT_CENTER</code>,
			 *							   <code>HorizontalCarousel.ALIGNMENT_LEFT</code> or 
			 *							   <code>HorizontalCarousel.ALIGNMENT_RIGHT</code>.
			 */			
			getAlignment: function () {
				return this._activeWidgetAlignment;	
			},
			/**
			 * Set the alignment offsetof the active item.
			 * @param {Integer} offset
			 */
			setAlignmentOffset: function (offset) {
				this._activeWidgetAlignmentOffset = offset;  
			},
			/**
			 * Get the current alignment offest of the active item.
			 * @returns {Integer}
			 */			
			getAlignmentOffset: function () {
				return this._activeWidgetAlignmentOffset;	
			},
			/**
			 * Set the frames per second of the active widget selection animation.
			 * @param {Integer} fps
			 */
			setWidgetAnimationFPS: function (fps) {
				this._activeWidgetAnimationFPS = fps;  
			},
			/**
			 * Get the frames per second of the active widget selection animation.
			 * @returns {Integer}
			 */			
			getWidgetAnimationFPS: function () {
				return this._activeWidgetAnimationFPS;	
			},
			/**
			 * Set the duration of the active widget selection animation.
			 * @param {Integer} duration
			 */
			setWidgetAnimationDuration: function (duration) {
				this._activeWidgetAnimationDuration = duration;  
			},
			/**
			 * Get the duration of the active widget selection animation.
			 * @returns {Integer} 
			 */			
			getWidgetAnimationDuration: function () {
				return this._activeWidgetAnimationDuration;	
			},
			/**
			 * Set the easing style of the active widget selection animation.
			 * @param {String} easing 
			 *		Acceptable values are: 
			 *			bounce
			 *			bouncePast
			 *			easeFrom
			 *			easeTo
			 *			easeFromTo
			 *			easeInCirc
			 *			easeOutCirc
			 *			easeInOutCirc
			 *			easeInCubic
			 *			easeOutCubic
			 *			easeInOutCubic
			 *			easeInQuad
			 *			easeOutQuad
			 *			easeInOutQuad
			 *			easeInQuart
			 *			easeOutQuart
			 *			easeInOutQuart
			 *			easeInQuint
			 *			easeOutQuint
			 *			easeInOutQuint
			 *			easeInSine
			 *			easeOutSine
			 *			easeInOutSine
			 *			easeInExpo
			 *			easeOutExpo
			 *			easeInOutExpo
			 *			easeOutBounce
			 *			easeInBack
			 *			easeOutBack
			 *			easeInOutBack
			 *			elastic
			 *			swingFrom
			 *			swingTo
			 *			swingFromTo
			 *			
			 */
			setWidgetAnimationEasing: function (easing) {
				this._activeWidgetAnimationEasing = easing;  
			},
			/**
			 * Get the current alignment of the active item.
			 * @returns {String}
			 * 
			 */			
			getWidgetAnimationEasing: function () {
				return this._activeWidgetAnimationEasing;	
			},
			/**
			 * Set whether the carousel contains items of differing widths. When all items are the
			 * same width, we can enabled additional optimisations
			 * @param {Boolean} multiWidthItems Pass <code>true</code> if the carousel contains items of differing widths.
			 */
			setHasMultiWidthItems: function(multiWidthItems) {
				this._multiWidthItems = multiWidthItems;
			},

			/**
			 * Set whether to activate the next item then scroll. By default, the carousel will
			 * be scrolled, then the new item activated once the scrolling has finished.
			 * Note: If set to true, you must make sure your styling of activated/focussed items
			 * do not behave strangely where the carousel wraps.
			 * @param {Boolean} wrap Pass <code>true</code> to activate then scroll. Pass <code>false</code>
			 * 	to scroll then activate (default).
			 */
			setActivateThenScroll: function(activateThenScroll) {
				this._activateThenScroll = activateThenScroll;
			},
			setKeepHidden: function(keepHidden) {
				this._keepHidden = keepHidden;
			},
			
			/**
			 * Returns this index of the currently selected child widget.
			 */
			getSelectedChildWidgetIndex: function() {
				return this._selectedIndex;
			},
			
			/**
			 * Moves the selection to the previous focusable child widget.
			 */
			selectPreviousChildWidget: function() {
				return this._moveChildWidgetSelection(HorizontalCarousel.SELECTION_DIRECTION_LEFT);
			},

			/**
			 * Selects the next widget in the carousel.
			 */
			selectNextChildWidget: function() {
				return this._moveChildWidgetSelection(HorizontalCarousel.SELECTION_DIRECTION_RIGHT);
			},
			
			/**
			 * Finds a selectable widget in the specified direction and moves
			 * the focus to it.
			 */
			_moveChildWidgetSelection: function(direction) {
				var device = this.getCurrentApplication().getDevice();

				if (this._scrollHandle) {
					device.stopAnimation(this._scrollHandle);
				}

				var _newIndex = this._selectedIndex;
				var _nodeIndex = this._selectedIndex + this._prefixCloneCount;
				var _oldSelectedWidget = this._activeChildWidget;
				var _newSelectedWidget = null;
				var _centerElement = null;
				var _wrapped = false;

				do {
					if (direction == HorizontalCarousel.SELECTION_DIRECTION_LEFT) {
						_nodeIndex--;

						if (_newIndex > 0) {
							_newIndex--;
						} else if (this._wrapMode && this._childWidgetOrder.length > 3) { /* Only wrap when more than 3 items */
							_newIndex = this._childWidgetOrder.length - 1;
							_wrapped = true;
						} else {
							break;
						}
					} else if (direction == HorizontalCarousel.SELECTION_DIRECTION_RIGHT) {
						_nodeIndex++;

						if (_newIndex < this._childWidgetOrder.length - 1) {
							_newIndex++;
						} else if (this._wrapMode && this._childWidgetOrder.length > 3) { /* Only wrap when more than 3 items */
							_newIndex = 0;
							_wrapped = true;
						} else {
							break;
						}
					}

					var _widget = this._childWidgetOrder[_newIndex];
					if (_widget.isFocusable()) {
						_newSelectedWidget = _widget;
						break;
					}
				} while(true);

				// Centre on a cloned carousel item if we're wrapping to the other end.
				// Otherwise, just go to the new selected item.
				if (_wrapped && this._wrapMode === HorizontalCarousel.WRAP_MODE_VISUAL)	{
					_centerElement = this._getWrappedElement(direction, _oldSelectedWidget.outputElement);
				}
				else if (_newSelectedWidget) {
					_centerElement = _newSelectedWidget.outputElement;
				}
				
				if (_newSelectedWidget && _centerElement) {
					var self = this;

					this.bubbleEvent(new BeforeSelectedItemChangeEvent(this, _newSelectedWidget, _newIndex));

					function scrollDone() {
						if (!self._activateThenScroll) {
							self.setActiveChildWidget(_newSelectedWidget);
							self._selectedIndex = _newIndex;
						}

						// If we've just moved to the fake item off the end of the wrapped carousel,
						// snap to the real item at the opposite end when the animation completes.
						if (_wrapped && self._wrapMode === HorizontalCarousel.WRAP_MODE_VISUAL) {
							self._alignToElement(self._activeChildWidget.outputElement, true);
						}

						// Allow the carousel to move again.
						self.refreshViewport();
						self._scrollHandle = null;
					}

					if(this._activateThenScroll) {
						this.setActiveChildWidget(_newSelectedWidget);
						this._selectedIndex = _newIndex;
					}

					// If the offset is zero it means the element is not in the DOM, i.e. the other end of the carousel, scroll to 1 pixel
					// otherwise in CSS3 the scrollDone event will never be called
					var elpos = device.getElementOffset(_centerElement);
					if(elpos.left == 0) {
						elpos.left = 1;
					}

					var config = device.getConfig();
					var animate = !config.widgets || !config.widgets.horizontalcarousel || (config.widgets.horizontalcarousel.animate !== false);
					this._scrollHandle = this._alignToElement(_centerElement, this._isAnimationOverridden(animate), scrollDone);

					return true;
				} else {
					return false;
				}
			},

			_getWrappedElement : function(direction, element) {
				// Return the next/previous widget in the carousel - used to grab dummy widgets
				// used in the visual wrapping mode.
				do {
					element = (direction === HorizontalCarousel.SELECTION_DIRECTION_RIGHT ? element.nextSibling : element.previousSibling);
				} while (element && element.nodeType != 1);
				return element;
			},

			_isAnimationOverridden : function(animate) {
				return this._overrideAnimation || !animate; 
			},

			_alignToElement: function(el, skipAnimation, onAnimationCompleteHandler) {
				var device = this.getCurrentApplication().getDevice();
				var widgetpos = device.getElementOffset(el);
				var widgetsize = device.getElementSize(el);
				var masksize = device.getElementSize(this._maskElement);
				var offset = this._activeWidgetAlignmentOffset || 0;

				var newLeftPosition;
				switch(this._activeWidgetAlignment) {
					case HorizontalCarousel.ALIGNMENT_CENTER:
						newLeftPosition = widgetpos.left - (masksize.width - widgetsize.width)/2 + offset;
						break;
					case HorizontalCarousel.ALIGNMENT_LEFT:
						newLeftPosition = widgetpos.left + offset;
						break;
					case HorizontalCarousel.ALIGNMENT_RIGHT:
						newLeftPosition = widgetpos.left - (masksize.width - widgetsize.width) - offset;
						break;
				}

				return device.scrollElementTo({
					el: this._maskElement, 
					to: {
						left: newLeftPosition 
					},
					fps : this.getWidgetAnimationFPS(),
					duration: this.getWidgetAnimationDuration(),
					easing: this.getWidgetAnimationEasing(),
					skipAnim: skipAnimation, 
					onComplete: onAnimationCompleteHandler
				});
			}
		});

		HorizontalCarousel.ALIGNMENT_CENTER = 0;
		HorizontalCarousel.ALIGNMENT_LEFT = 1;
		HorizontalCarousel.ALIGNMENT_RIGHT = 2;

		HorizontalCarousel.SELECTION_DIRECTION_RIGHT = 'right';
		HorizontalCarousel.SELECTION_DIRECTION_LEFT = 'left';

		HorizontalCarousel.WRAP_MODE_NONE = 0;
		HorizontalCarousel.WRAP_MODE_NAVIGATION_ONLY = 1;
		HorizontalCarousel.WRAP_MODE_VISUAL = 2;

		HorizontalCarousel.VIEWPORT_MODE_NONE = 0;
		HorizontalCarousel.VIEWPORT_MODE_CLASSES = 1;
		HorizontalCarousel.VIEWPORT_MODE_DOM = 2;

		return HorizontalCarousel;
	}
);