/*
---

description: A plugin for enabling autocomplete of a text input or textarea.

authors:
 - Fábio Miranda Costa
 - Ian Wilson

requires:
 - Core/Class.Extras
 - Core/Element.Event
 - Core/Element.Style
 - More/Element.Forms

license: MIT-style license

provides: [Meio.Autocomplete]

changes:
  - Conform to JSLint with command line options:
    --encoding utf8 --white --indent 4 --maxlen 80 --plusplus --maxerr 50
    --onevar --bitwise --undef --nomen --newcap --regexp
  - Remove Cache, Request and Filter.
  - Consoldate element behaviour.

...
*/

(function ($) {
    var commandKeys, Autocomplete;

    // Custom Events

    // thanks Jan Kassens
    Object.append(Element.NativeEvents, {
        'paste': 2,
        'input': 2
    });

    Element.Events.paste = {
        condition: function (e) {
            this.fireEvent('paste', e, 1);
            return false;
        }
    };
    if (Browser.opera || (Browser.firefox && Browser.version < 3)) {
        Element.Events.paste.base = 'input';
    } else {
        Element.Events.paste.base = 'paste';
    }
    
    // the key event that repeats
    Element.Events.keyrepeat = {
        condition: Function.from(true)
    };
    if (Browser.firefox || Browser.opera) {
        Element.Events.keyrepeat.base = 'keypress';
    } else {
        Element.Events.keyrepeat.base = 'keydown';
    }

    commandKeys = {
        9:   1,  // tab
        16:  1,  // shift
        17:  1,  // control
        18:  1,  // alt
        224: 1,  // command (meta onkeypress)
        91:  1,  // command (meta onkeydown)
        37:  1,  // left
        38:  1,  // up
        39:  1,  // right
        40:  1   // down
    }; 
    
    Autocomplete = new Class({
        Implements: [Options, Events],
        
        options: {
            // Width of the container for the results.
            // If no value is given then width is retrieved from input element.
            widthOfResultsContainer: null,
            // CSS Classes used.
            classes: {
                container: 'ma-container',
                hover: 'ma-hover',
                odd: 'ma-odd',
                even: 'ma-even',
                selected: 'ma-selected',
                loading: 'ma-loading',
                empty: 'ma-empty'
            },
            // The minimum number of chars to cause a request for results.
            minChars: 0,
            // True if the tab key should cause the list item with focus to
            //      be selected.
            selectOnTab: true,
            // The max number of list items to be shown in the results
            //     container.
            maxVisibleItems: 10,
            // The entire li.
            formatResult: null,
            // Title of li.
            formatTitle: null,
            // Content of li.
            formatContent: null,
            // Called when a new result has been selected.
            //
            // function onSelect (listItemEl, result, resultIndex) {}
            onSelect: null,
            // Called when a prior result was selected but
            // has become de-selected.
            //
            // function onDeselect (listItemEl, result, resultIndex) {}
            onDeselect: null,
            //
            // The function startSyncResultsRequest is called to request results
            //     when the autocomplete is attached.  The callee will call
            //     onSuccess with the results. The callee will call onFailure on
            //     any error. Empty results are NOT an error. It is expected 
            //     that in most cases a request will be fake and pull straight
            //     from the dom.
            //
            // function startSyncResultsRequest (inputedText, onSuccess,
            //         onFailure) {
            //     onSuccess([]);
            // }
            startSyncResultsRequest: null,
            // The function stopResultsRequest is meant to cancel a sync request
            //     for results that was started earlier.  If there is no request
            //     to cancel then nothing will be done.
            //
            // function stopSyncResultsRequest() {}
            stopSyncResultsRequest: null
        },
        
        initialize: function (startResultsRequest, stopResultsRequest,
                options) {
            /*

            The function startResultsRequest is called to request results. The
                callee will call onSuccess with the results. The callee will
                call onFailure on any error. Empty results are NOT an error.

            function startResultsRequest(inputedText, onSuccess, onFailure) {
                onSuccess([]);
            }

            The function stopResultsRequest is meant to cancel a request for
                results that was started earlier.  If there is no request to
                cancel then nothing will be done.

            function stopResultsRequest() {}

            */
            this.setOptions(options);

            // TODO: What does this really do ?
            this.active = 0;

            this.startResultsRequest = startResultsRequest;
            this.stopResultsRequest = stopResultsRequest;

            if (this.options.formatResult !== null) {
                this.formatResult = this.options.formatResult;
            }
            if (this.options.formatTitle !== null) {
                this.formatTitle = this.options.formatTitle;
            }
            if (this.options.formatContent !== null) {
                this.formatContent = this.options.formatContent;
            }

            if (this.options.startSyncResultsRequest !== null) {
                this.startSyncResultsRequest =
                        this.options.startSyncResultsRequest;
            } else {
                this.startSyncResultsRequest = null;
            }

            // TODO: Do we REALLY need this ?
            if (this.options.stopSyncResultsRequest !== null) {
                this.stopSyncResultsRequest =
                        this.options.stopSyncResultsRequest;
            } else {
                this.stopSyncResultsRequest = null;
            }

            // TODO: What does this do ?
            this.keyPressControl = {};

            // Initialize element pointers.
            this.inputEl = null;
            this.containerEl = null;
            this.listEl = null;

            // TODO: Figure out the rules for these.
            this.inputedText = null;
            this.oldInputedText = null;

            // The list item which has focus placed on it.
            this.focusedListItemEl = null;

            // Last results fetched, used to feed result back to integrator.
            this.results = null;

            // This timer prevents a flood of key events.
            this.keyrepeatTimer = null;

            // Events of this class.
            this.addEvents({
                select: function (itemEl, result, resultIndex) {
                    this.inputEl.addClass(this.options.classes.selected);
                },
                deselect: function (itemEl, result, resultIndex) {
                    this.inputEl.removeClass(this.options.classes.selected);
                }
            });

            // Special event for IE weirdness.
            window.addEvent('unload', (function () {
                // if autocomplete is off when you reload the page the input
                // value gets erased
                if (this.inputEl !== null) {
                    this.inputEl.set('autocomplete', 'on'); 
                }
            }).bind(this));

            // Events for the list/container element.
            this.listEvents = {
                mouseover: function (e) {
                    /* Mousing over a new list item should change the focuses
                    list item. */
                    var itemEl, hoverClass;
                    itemEl = this.getItemFromEvent(e);
                    hoverClass = this.options.classes.hover;
                    if (!itemEl) {
                        return true;
                    }
                    if (this.focusedListItemEl) {
                        this.focusedListItemEl.removeClass(hoverClass);
                    }
                    itemEl.addClass(hoverClass);
                    this.focusedListItemEl = itemEl;
                    this.fireEvent('focusItem', [this.focusedListItemEl]);
                },
                mousedown: function (e) {
                    /* Selecting a new 
                   
                    */
                    e.preventDefault();
                    this.shouldNotBlur = true;
                    this.focusedListItemEl = this.getItemFromEvent(e);
                    if (!this.focusedListItemEl) {
                        return true;
                    } else {
                        if (this.active) {
                            this.setInputValue();
                        }
                    }
                    this.focusedListItemEl.removeClass(
                            this.options.classes.hover);
                }
            };

            // Events for the input element.
            this.inputEvents = {
                'keyup': function (e) {
                    if (!commandKeys[e.code]) {
                        if (!this.keyPressControl[e.key]) {
                            this.setupList();
                        }
                        this.keyPressControl[e.key] = false;
                    }
                },
                'focus': function () {
                    this.active = 1;
                    this.focusedListItemEl = null;
                    this.positionResultsContainer();
                },
                'click': function () {
                    this.active = this.active + 1;
                    //TODO: Is this for double click ? It includes focus.
                    if (this.active > 2 && !this.showing) {
                        this.forceSetupList();
                    }
                },
                'blur': function (e) {
                    this.active = 0;
                    if (this.shouldNotBlur) {
                        this.inputEl.setCaretPosition('end');
                        this.shouldNotBlur = false;
                        if (this.focusedListItemEl) {
                            this.hide();
                        }
                    } else {
                        this.hide();
                    }
                },
                'paste': function () {
                    return this.setupList();
                },
                keyrepeat: function (e) {
                    this.beforeKeyrepeat(e);
                    this.keyrepeat(e);
                }
            };
            
            // ie6 only, uglyness
            // this fix the form being submited on the press of the enter key
            if (Browser.ie && Browser.version == 6) {
                this.inputEvents.keypress = function (e) {
                    if (e.key == 'enter') {
                        this.keyrepeat(e);
                    }
                };
            }
        },

        attach: function (inputEl) {
            var enteredText;
            this.inputEl = inputEl;
            this.inputEl.set('autocomplete', 'off');

            this.buildList();
            
            Object.each(this.listEvents, function (handler, name, obj) {
                obj[name] = handler.bind(this);
                this.listEl.addEvent(name, obj[name]);
            }, this);
            Object.each(this.inputEvents, function (handler, name, obj) {
                obj[name] = handler.bind(this);
                this.inputEl.addEvent(name, obj[name]);
            }, this);

            if (this.startSyncResultsRequest !== null) {
                enteredText = this.inputEl.get('value');
                if (enteredText) {
                    this.startSyncResultsRequest(enteredText,
                            this.syncResultsRequestSuccess.bind(this),
                            this.syncResultsRequestFailure.bind(this));
                }
            }
        },

        beforeKeyrepeat: function (e) {
            //TODO: Why?
            this.active = 1;
            //TODO: Why?
            if (e.key == 'up' || e.key == 'down' ||
                (e.key == 'enter' && this.showing)) {
                e.preventDefault();
            }
        },
        
        delayedKeyrepeat: function (e) {
            // TODO: Why ?
            var key = e.key;
            this.keyPressControl[key] = true;
            if (key == 'up' || key == 'down') {
                if (this.showing) {
                    // If the list is showing then,
                    // move around in it.
                    this.focusItem(key);
                } else {
                    // Otherwise show the list
                    // THEN move around in it.
                    this.forceSetupList();
                    this.onUpdate = (function () {
                        this.focusItem(key);
                    }).bind(this);
                }
            } else if (key == 'enter') {
                this.setInputValue();
            } else if (key == 'tab') {
                if (this.options.selectOnTab) {
                    this.setInputValue();
                }
                // tab blurs the input so the keyup event wont happen
                // at the same input you made a keydown
                this.keyPressControl[key] = false;
            } else if (key == 'esc') {
                this.hide();
            } else {
                this.setupList();
            }
            this.oldInputedText = this.inputEl.get('value');
        },
        
        keyrepeat: function (e) {
            /*
            This function is called everytime a key is pressed. The input
            element's value is not updated though until after this event so
            we setup a timer to call another function so that the key can get
            through and we can act on the final value.

            We don't cancel the timeout because we would miss keys.
            */
            (function (e) {
                this.delayedKeyrepeat(e);
            }).delay(1, this, [e]);
        },

        syncResultsRequestSuccess: function (results) {
            if (results.length === 0) {
                this.inputEl.set('value', '');
            } else {
                this.inputEl.set('value', results[0].text);
                this.oldInputedText = results[0].text;
                this.focusedListItemEl = this.formatResult(
                        this.inputEl.get('value'), results[0], 0);
                this.fireEvent('select', [this.focusedListItemEl,
                        this.results[0], 0]);
                this.results = [results[0]];
            }
        },

        syncResultsRequestFailure: function (failureDetails) {
            this.inputEl.set('value', '');
        },
        
        formatTitle: function (inputedText, result, resultIndex) {
            return result.text;
        },

        formatContent: function (inputedText, result, resultIndex) {
            return result.content;
        },

        formatResult: function (inputedText, result, resultIndex) {
            var listItemEl, cssClass, title, content;
            if (resultIndex % 2) {
                cssClass = this.options.classes.even;
            } else {
                cssClass = this.options.classes.odd;
            }
            title = this.formatTitle(inputedText, result, resultIndex);
            content = this.formatContent(inputedText, result, resultIndex);
            listItemEl = new Element('li', {
                'title': title,
                'className': cssClass
            });
            if (typeOf(content === 'string')) {
                listItemEl.set('html', content);
            } else {
                listItemEl.adopt(content);
            }
            listItemEl.store('resultIndex', resultIndex);
            listItemEl.store('resultText', result.text);
            return listItemEl;
        },

        formatResults: function (results) {
            var i, resultEls;
            resultEls = [];
            for (i = 0; i < results.length; i = i + 1) {
                resultEls.push(this.formatResult(this.inputedText,
                        results[i], i));
            }
            return resultEls;
        },

        buildList: function () {
            this.containerEl = new Element('div', {
                'class': this.options.classes.container
            });
            if (Browser.ie && Browser.version == 6) {
                this.shim = new IframeShim(this.containerEl, {
                    top: 0,
                    left: 0
                });
            }
            this.listEl = new Element('ul');
            this.listEl.inject(this.containerEl);
            this.containerEl.inject(document.body, 'bottom');
        },

        applyMaxHeight: function () {
            /*
            Grab the last element in the list and use it to fix the height.
            */
            var lastChildIndex, lastChildEl, i;
            if (this.options.maxVisibleItems !== null) {
                lastChildIndex = this.options.maxVisibleItems - 1;
            } else {
                lastChildIndex = 0;
            }
            lastChildIndex = Math.min(lastChildIndex,
                    this.listEl.getChildren().length - 1);
            if (lastChildIndex >= 0) {
                lastChildEl = this.listEl.getChildren()[lastChildIndex];
                // uggly hack to fix the height of the autocomplete list
                for (i = 0; i < 2; i = i + 1) {
                    this.containerEl.setStyle('height',
                            lastChildEl.getCoordinates(this.listEl).bottom);
                }
            }
        },

        positionResultsContainer: function () {
            var width, containerEl, fieldElPosition;
            width = this.options.widthOfResultsContainer;
            containerEl = this.containerEl;
            if (width === null) {
                width = this.inputEl.getWidth().toInt() -
                        containerEl.getStyle('border-left-width').toInt() -
                        containerEl.getStyle('border-right-width').toInt();

            }
            containerEl.setStyle('width', width);
            fieldElPosition = this.inputEl.getCoordinates();
            containerEl.setPosition({
                x: fieldElPosition.left,
                y: fieldElPosition.bottom
            });
        },
        
        show: function () {
            window.console.log('show');
            this.containerEl.scrollTop = 0;
            this.containerEl.setStyle('visibility', 'visible');
            this.showing = true;
        },
        
        hide: function () {
            window.console.log('hide');
            this.showing = false;
            this.containerEl.setStyle('visibility', 'hidden');
        },
        
        setupList: function () {
            // What is the purpose of this value ?
            this.inputedText = this.inputEl.get('value');
            if (this.inputedText !== this.oldInputedText) {
                this.forceSetupList(this.inputedText);
            } else {
                window.console.log('setupList is hiding');
                this.hide();
            }
            return true;
        },
        
        forceSetupList: function (inputedText) {
            this.inputedText = inputedText || this.inputEl.get('value');
            if (this.inputedText.length >= this.options.minChars) {
                this.stopResultsRequest();
                this.stopRequestIndicator();
                this.startRequestIndicator();
                this.startResultsRequest(this.inputedText,
                        this.resultsRequestSuccess.bind(this),
                        this.resultsRequestFailure.bind(this));
            }
        },

        resultsRequestFailure: function () {
            // TODO: Do something realistic here.
            this.resultsRequestSuccess([]);
        },

        stopRequestIndicator: function () {
            this.inputEl.removeClass(this.options.classes.loading);
        },

        retrievedNoResults: function () {
            window.console.log('retrievedNoResults');
            this.inputEl.addClass(this.options.classes.empty);
        },

        retrievedSomeResults: function () {
            window.console.log('retrievedSomeResults');
            this.inputEl.removeClass(this.options.classes.empty);
        },

        startRequestIndicator: function () {
            this.inputEl.addClass(this.options.classes.loading);
        },
        
        resultsRequestSuccess: function (results) {
            window.console.log('resultsRequestSuccess', results);
            this.stopRequestIndicator();
            var resultIndex;
            if (this.focusedListItemEl !== null) {
                resultIndex = this.focusedListItemEl.retrieve('resultIndex');
                this.fireEvent('deselect', [this.focusedListItemEl,
                        this.results[resultIndex], resultIndex]);
            }
            this.results = results;
            this.listEl.empty();
            this.listEl.adopt(this.formatResults(results));
            this.focusedListItemEl = null;
            if (this.options.maxVisibleItems) {
                this.applyMaxHeight();
            }

            if (this.onUpdate) {
                this.onUpdate();
                this.onUpdate = null;
            }
            if (this.listEl.getChildren().length > 0) {
                this.retrievedSomeResults();
                if (this.active) {
                    this.show();
                }
            } else {
                this.retrievedNoResults();
                this.hide();
            }
        },
        
        setInputValue: function () {
            /* Set the input value and hide the list. */
            var resultIndex;
            if (this.focusedListItemEl) {
                this.inputEl.set('value',
                        this.focusedListItemEl.retrieve('resultText'));
                resultIndex = this.focusedListItemEl.retrieve('resultIndex');
                this.fireEvent('select', [this.focusedListItemEl,
                        this.results[resultIndex], resultIndex]);
            }
            this.hide();
        },
        
        focusItem: function (direction) {
            window.console.log('focusItem', direction);
            /* Focus on a list item. */
            var hoverClass, newFocusedItemEl;
            if (this.showing) {
                hoverClass = this.options.classes.hover;
                if (this.focusedListItemEl) {
                    window.console.log('A list item was focused.');
                    if (direction == 'up') {
                        newFocusedItemEl = this.focusedListItemEl.getPrevious();
                    } else {
                        newFocusedItemEl = this.focusedListItemEl.getNext();
                    }
                    if (newFocusedItemEl) {
                        this.focusedListItemEl.removeClass(hoverClass);
                        newFocusedItemEl.addClass(hoverClass);
                        this.focusedListItemEl = newFocusedItemEl;
                        this.scrollFocusedItem(direction);
                    }
                } else {
                    // Both up and down go to the first item.
                    newFocusedItemEl = this.listEl.getFirst();
                    if (newFocusedItemEl) {
                        newFocusedItemEl.addClass(hoverClass);
                        this.focusedListItemEl = newFocusedItemEl;
                    }
                }
            }
        },
        
        scrollFocusedItem: function (direction) {
            /* If less results are displayed then exist then when moving from
            the bottom item to the next item with the keyboard requires that
            the div is manually scrolled.
            */
            window.console.log('scrollFocusedItem', direction);
            var focusedItemCoordinates, delta, top, scroll;
            focusedItemCoordinates =
                    this.focusedListItemEl.getCoordinates(this.listEl);
            scroll = this.containerEl.getScroll();
            if (direction == 'down') {
                delta = focusedItemCoordinates.bottom -
                        this.containerEl.getStyle('height').toInt();
                if ((delta - scroll.y) > 0) {
                    this.containerEl.scrollTo(0, delta);
                }
            } else {
                top = focusedItemCoordinates.top;
                window.console.log('top of focusedItem is ', top);
                if (scroll.y && scroll.y > top) {
                    this.containerEl.scrollTo(0, top);
                }
            }
        },
        
        getItemFromEvent: function (e) {
            /* Extract the affected list item element from the event. */
            var target = e.target;
            while (target && target.tagName.toLowerCase() != 'li') {
                if (target === this.containerEl) {
                    return null;
                }
                target = target.getParent();
            }
            // TODO: Do we need to wrap this in $ ?
            return $(target);
        }
    });

    if (window.hasOwnProperty('Meio')) {
        window.Meio.Autocomplete = Autocomplete;
    } else {
        window.Meio = {
            Autocomplete: Autocomplete
        };
    }
    
})(document.id || $);
