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
            // The minimum number of characters that will trigger a
            // request for results.
            minChars: 0,
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
            stopSyncResultsRequest: null,
            // Number of milliseconds to wait after the input has changed to
            // start a request for results.
            requestDelay: 100
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

            // True when the autocomplete's text input is in focus.
            this.active = false;

            // Number of times the field element has been clicked while
            // active.
            this.activeClicks = 0;

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

            // Initialize element pointers.
            this.inputEl = null;
            this.containerEl = null;
            this.listEl = null;

            // The list item which has focus placed on it.
            this.focusedListItemEl = null;

            // The list item which is selected.
            this.selectedListItemEl = null;

            // Last results fetched, used to feed result back to integrator.
            this.results = null;

            // Timer for delayed start of request.
            this.requestTimer = null;

            // The last value that was entered into the text box.
            this.lastValueEntered = null;

            // True if blur should not occur when we have a list item in focus.
            this.shouldNotBlur = false;
            
            // Events of this class.
            this.addEvents({
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
                    e.preventDefault();
                    this.shouldNotBlur = true;
                    this.focusedListItemEl = this.getItemFromEvent(e);
                    if (!this.focusedListItemEl) {
                        return true;
                    } else {
                        if (this.active) {
                            this.selectFocusedListItem();
                        }
                    }
                    this.focusedListItemEl.removeClass(
                            this.options.classes.hover);
                }
            };

            // Events for the input element.
            this.inputEvents = {
                keydown: function (e) {
                    /* Act on command keys. */
                    var key = e.key;
                    
                    // A key press clears all prior clicks.
                    this.activeClicks = 0;

                    // Stop these keys because they act on the results.
                    if (e.key == 'up' || e.key == 'down' ||
                        (e.key == 'enter' && this.showing)) {
                        // TODO: This might not work in all browsers,
                        // in which case the form might be submitted.
                        e.preventDefault();
                    }
                    if (key == 'up' || key == 'down') {
                        if (this.showing) {
                            // If the list is showing then,
                            // move around in it.
                            this.focusItem(key);
                        } else {
                            // Otherwise show the list
                            // THEN move around in it.
                            this.setupList();
                            this.onUpdate = (function () {
                                this.focusItem(key);
                            }).bind(this);
                        }
                    } else if (key == 'enter') {
                        this.selectFocusedListItem();
                    } else if (key == 'tab') {
                        if (this.options.selectOnTab) {
                            this.selectFocusedListItem();
                        }
                    } else if (key == 'esc') {
                        this.hide();
                    }
                },
                keyup: function (e) {
                    /* Start a request if the key was not a command key. */
                    var valueEntered;
                    if (!commandKeys[e.code] && e.key !== 'enter') {
                        valueEntered = this.inputEl.get('value');
                        if (this.lastValueEntered !== valueEntered) {
                            this.lastValueEntered = valueEntered;
                            this.deselect();
                            if (this.requestTimer !== null) {
                                window.clearTimeout(this.requestTimer);
                            }
                            this.requestTimer = (function () {
                                this.requestTimer = null;
                                this.setupList();
                            }).delay(this.options.requestDelay, this);
                        }
                    }
                },
                focus: function () {
                    /* Focus on the input field. */
                    this.active = true;
                    this.focusedListItemEl = null;
                    this.positionResultsContainer();
                },
                'click': function () {
                    /* Count active clicks on the input field. */
                    if (this.active) {
                        this.activeClicks = this.activeClicks + 1;
                    }
                    if (this.active && this.activeClicks >= 2 &&
                            !this.showing) {
                        this.setupList();
                    }
                },
                'blur': function (e) {
                    this.active = false;
                    this.activeClicks = 0;
                    if (this.shouldNotBlur) {
                        this.inputEl.setCaretPosition('end');
                        this.shouldNotBlur = false;
                        if (this.focusedListItemEl) {
                            this.hide();
                        }
                    } else {
                        this.hide();
                    }
                }
            };

            function paste() {
                var valueEntered;
                valueEntered = this.inputEl.get('value');
                if (this.lastValueEntered !== valueEntered) {
                    this.lastValueEntered = valueEntered;
                    this.deselect();
                    this.setupList();
                }
            }
            /* Paste event varies between browsers. 
            if (Browser.opera || (Browser.firefox && Browser.version < 3)) {
                this.inputEvents.input = paste;
            } else {
                this.inputEvents.paste = paste;
            }*/
            
            // ie6 only, uglyness
            // this fix the form being submited on the press of the enter key
            if (Browser.ie && Browser.version == 6) {
                this.inputEvents.keypress = function (e) {
                    if (e.key == 'enter') {
                        this.keydown(e);
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
        select: function (selectedResult, selectedResultIndex) {
            /* Select a result .*/
            if (this.selectedResult !== null) {
                this.deselect();
            }
            this.selectedResult = selectedResult;
            this.selectedResultIndex = selectedResultIndex;
            this.fireEvent('select', [selectedResult, selectedResultIndex]);
            this.inputEl.addClass(this.options.classes.selected);
        },
        deselect: function () {
            /* Deselect a result. */
            if (this.selectedResult !== null) {
                this.inputEl.removeClass(this.options.classes.selected);
                this.fireEvent('deselect', [this.selectedResult,
                        this.selectedResultIndex]);
                this.selectedResult = null;
                this.selectedResultIndex = null;
            }
        },
        syncResultsRequestSuccess: function (results) {
            if (results.length === 0) {
                this.inputEl.set('value', '');
            } else {
                this.inputEl.set('value', results[0].text);
                this.lastEnteredText = results[0].text;
                this.select(results[0], 0);
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
                resultEls.push(this.formatResult(this.lastValueEntered,
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
            this.containerEl.scrollTop = 0;
            this.containerEl.setStyle('visibility', 'visible');
            this.showing = true;
        },
        hide: function () {
            this.showing = false;
            this.containerEl.setStyle('visibility', 'hidden');
        },
        setupList: function () {
            if (this.lastValueEntered.length >= this.options.minChars) {
                this.stopResultsRequest();
                this.stopRequestIndicator();
                this.startRequestIndicator();
                this.startResultsRequest(this.lastValueEntered,
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
            this.inputEl.addClass(this.options.classes.empty);
        },
        retrievedSomeResults: function () {
            this.inputEl.removeClass(this.options.classes.empty);
        },
        startRequestIndicator: function () {
            this.inputEl.addClass(this.options.classes.loading);
        },
        resultsRequestSuccess: function (results) {
            this.stopRequestIndicator();
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
        selectFocusedListItem: function () {
            /* Set the input value to the focused list item's value and
            hide the list. */
            var resultIndex, valueEntered;
            if (this.focusedListItemEl) {
                valueEntered = this.focusedListItemEl.retrieve('resultText');
                this.inputEl.set('value', valueEntered);
                this.lastValueEntered = valueEntered;
                resultIndex = this.focusedListItemEl.retrieve('resultIndex');
                this.select(this.results[resultIndex], resultIndex);
            }
            this.hide();
        },
        focusItem: function (direction) {
            /* Focus on a list item. */
            var hoverClass, newFocusedItemEl;
            if (this.showing) {
                hoverClass = this.options.classes.hover;
                if (this.focusedListItemEl) {
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
