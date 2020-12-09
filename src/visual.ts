/**
 * Copyright (c) 2017 Microsoft
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import 'core-js/stable/object/assign';

// TODO: Fix alignment of navigation frame hover popup
require("intro.js/introjs.css"); // Loads the intro.js css

import powerbiVisualsApi from "powerbi-visuals-api";
import IVisual = powerbiVisualsApi.extensibility.IVisual;
import IVisualHost = powerbiVisualsApi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbiVisualsApi.extensibility.visual.VisualConstructorOptions;
import EnumerateVisualObjectInstancesOptions = powerbiVisualsApi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration = powerbiVisualsApi.VisualObjectInstanceEnumeration;
import VisualUpdateOptions = powerbiVisualsApi.extensibility.visual.VisualUpdateOptions;
import Settings from './settings';
import convert from './dataConversion';
import { clamp } from './utils';
import calcUpdateType from './lib/calcUpdateType';
import UpdateType from './lib/UpdateType';
import TimelineStorytellerDefinition from "./core/main";
import utils from "./core/utils";
import images from "./core/imageUrls";

const isSafari = !!navigator.userAgent.match(/Version\/[\d\.]+.*Safari/);


/**
 * Timeline story teller PowerBI visual class.
 * @class TimelineStoryteller
 */
export class TimelineStoryteller implements IVisual {
    private teller: any;
    private columnMappings: { [bucket: string]: any };
    private element: HTMLElement;
    private settings: Settings = new Settings();
    private host: IVisualHost;
    private firstUpdate = true;
    private dataView: powerbiVisualsApi.DataView;
    private options: powerbiVisualsApi.extensibility.visual.VisualUpdateOptions;

    /**
     * TimelineStoryteller class constructor.
     *
     * @constructor
     * @param {VisualConstructorOptions} options - The initialization options as provided by PowerBI.
     */
    constructor(options: VisualConstructorOptions) {
        this.element = options.element;
        this.element.className += ' timelinestoryteller-powerbi';
        this.element.style.visibility = 'hidden';
        this.host = options.host;
        this.teller = new TimelineStorytellerDefinition(true, false, options.element);
        this.teller.setUIScale(.7);
        this.teller.setOptions(this.buildTimelineOptions());
        this.teller.on("stateChanged", () => this.saveStory());

        const toHide = this.element.querySelectorAll(".file_selection_container .image_local_add_drop_zone, .file_selection_container h5" + (isSafari ? ", .offline_option_container, .options_container, .image_local_add_container " : ""));
        Array.prototype.forEach.call(toHide, n => {
            n.style.display = "none";
        });

        if (isSafari) {
            const toDisable = this.element.querySelectorAll(".resize_enabled_cb, .offline_enabled_cb");
            Array.prototype.forEach.call(toDisable, n => {
                n.checked = false;
            });
        }
    }

    /**
     * TimelineStoryteller's visualization destroy method. Called by PowerBI.
     *
     * @method destroy
     */
    public destroy(): void {
    }

    /**
     * Update function called by PowerBI when the visual or its data need to be updated.
     *
     * @method update
     * @param {VisualUpdateOptions} options - Update options object as provided by PowerBI.
     */
    public update(options: VisualUpdateOptions): void {
        const dv = this.dataView = options.dataViews && options.dataViews[0];
        if (dv && dv.table) {
            const isFirstUpdate = this.firstUpdate;
            const updateType = calcUpdateType(this.options, options);

            // Let the timeline storyteller know it was resized
            if (!this.options ||
                this.options.viewport.width !== options.viewport.width ||
                this.options.viewport.height !== options.viewport.height) {
                this.teller._onResized();
            }

            // This needs to happen after the updateType calc
            this.options = options;

            if ((updateType & UpdateType.Settings) === UpdateType.Settings) {
                this.loadSettings();
            }

            if ((updateType & UpdateType.Data) === UpdateType.Data) {
                this.firstUpdate = false;

                this.loadData(isFirstUpdate);
            }
        }
    }

    /**
     * This method will be executed only if the formatting panel is open.
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
        // This should not be visible
        const savedStory = this.settings.story.savedStory;
        delete this.settings.story.savedStory;

        const objs = Settings.enumerateObjectInstances(this.settings, options);

        this.settings.story.savedStory = savedStory;

        return objs;
    }

    /**
     * Builds the options for TimelineStoryteller
     */
    private buildTimelineOptions() {
        const importStoryMenu = utils.clone(TimelineStorytellerDefinition.DEFAULT_OPTIONS.import.storyMenu);
        const menu = utils.clone(TimelineStorytellerDefinition.DEFAULT_OPTIONS.menu);
        menu.export = {};
        menu.open = {
            label: 'Data',
            items: {
                open: menu.open.items[0],
                reset: {
                    text: 'Reset',
                    image: images("resetBasic.png"),
                    click: this.reset.bind(this)
                }
            }
        };
        this.teller.setOptions({
            showAbout: false,
            showLogo: false,
            // showImportOptions: true,
            showIntro: false,
            showHints: false,
            export: {
                images: false
            },
            import: {
                storyMenu: {
                    items: {
                        file: importStoryMenu.items.file,
                    }
                }
            },
            menu
        });
    }

    /**
     * Loads settings from PowerBI
     */
    private loadSettings() {
        const dv = this.dataView;
        const oldSettings = this.settings;
        this.settings = dv ? Settings.parse<Settings>(dv) : new Settings();

        // Clamp the UI Scale
        let newScale = this.settings.display.uiScale;
        this.settings.display.uiScale = newScale ? clamp(newScale, 0.1, 2) : 0.7;

        newScale = this.settings.display.uiScale;
        if (oldSettings.display.uiScale !== newScale) {
            this.teller.setUIScale(newScale);
        }
    }

    /**
     * Resets the current state of timeline storyteller
     */
    private reset() {
        this.settings.story.savedStory = "";
        this.host.persistProperties({
            replace: [{
                objectName: 'story',
                selector: null,
                properties: {
                    savedStory: ''
                }
            }]
        });
        this.loadData(false);
    }

    /**
     * Loads data from PowerBI into TimelineStoryteller
     * @param isFirstUpdate If this is the load call from the fist update
     */
    private loadData(isFirstUpdate: boolean) {
        const data = convert(this.dataView);
        let display = 'hidden';
        if (data) {
            display = '';
            // Disable the update calls until we can nail down the filtering, it looks like when .update is called for the first time with filtered
            // data, it applies some transparency that it shouldn't
            // We are initially loading
            // if (!this.columnMappings || cols.filter(n => (newMappings[n] || {}).parent === (this.columnMappings[n] || {}).parent).length !== cols.length) {
            // this.columnMappings = newMappings;
            // this.teller.load(data);
            // } else {
            // this.teller.update(data);
            // }

            const savedStory = this.settings.story.savedStory;
            const timelineState = savedStory ? JSON.parse(savedStory) : {};
            timelineState.timeline_json_data = data;

            if (isFirstUpdate && this.settings.story.autoLoad) {
                // Give it time to load the data first
                setTimeout(() => this.teller.load(timelineState, true), 1000);
            } else {
                this.teller.load(timelineState, false, true);
            }
        }

        const elesToHide = document.querySelectorAll('.introjs-hints, .timelinestoryteller-powerbi');
        for (let i = 0; i < elesToHide.length; i++) {
            elesToHide[i]['style'].visibility = display;
        }
    }

    /**
     * Saves the current story to powerbi
     */
    private saveStory() {
        const savedStory = JSON.stringify(this.teller.saveState());
        this.host.persistProperties({
            replace: [{
                objectName: 'story',
                selector: null,
                properties: {
                    savedStory
                }
            }]
        });
    }
}
