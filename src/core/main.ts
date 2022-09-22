/**
 * Styles
 */
import "../../assets/css/style.css";

/**
 * Libraries
 */
import d3 from "d3";
import * as moment from "moment";
import introJsLib from "intro.js";

const introJs = typeof introJsLib === "function" ? introJsLib : introJsLib.introJs;
import configurableTL from "./configurableTL";
import addCaption from "./addCaption";
import globals from "./globals";
import addImage from "./addImage";
import annotateEvent from "./annotateEvent";
import colorSchemes from "./colors";
import imageUrls from "./imageUrls";
import svgImageUtils from "./lib/saveSvgAsPng";
import utils from "./utils";
import addImagePopup from "./dialogs/addImageDialog";
import annotations from "./annotations";
import colorPickerPopup from "./colorPickerPopup";

var selectWithParent = utils.selectWithParent;
var selectAllWithParent = utils.selectAllWithParent;
var setScaleValue = utils.setScaleValue;
var getHighestId = utils.getHighestId;
var clone = utils.clone;
var debounce = utils.debounce;

var time = require("./lib/time.min");
var GIF = require("./lib/gif").GIF;
var gsheets = require("./lib/gsheets.min");

var gif = new GIF({
  workers: 2,
  quality: 10,
  background: "#fff",
  workerScript: URL.createObjectURL(new Blob([require("raw-loader!./lib/gif.worker.js")], { type: "text/javascript" })) // Creates a script url with the contents of "gif.worker.js"
});
var getNextZIndex = annotations.getNextZIndex;
//var log = require("debug")("TimelineStoryteller:main");
const isIE11 = !!window.MSInputMethodContext && !!(<any>document).documentMode;

/**
 * Creates a new TimelineStoryteller component
 * @param {boolean} [isServerless=false] True if the component is being run in a serverless environment (default false)
 * @param {boolean} [showDemo=false] True if the demo code should be shown (default true)
 * @param {HTMLElement} parentElement The element in which the Timeline Storyteller is contained (default: body)
 * @returns {TimelineStoryteller} An instance of the TimelineStoryteller
 */
function TimelineStoryteller(isServerless, showDemo, parentElement) {
  var instance = this;
  var timeline_vis = configurableTL(globals.unit_width, globals.padding);
  parentElement = parentElement || document.body;
  this.parentElement = parentElement;
  this._timeline_vis = timeline_vis;
  this._loaded = false;
  this.scale = 1;
  this._dispatch = d3.dispatch("stateChanged");
  this.on = this._dispatch.on.bind(this._dispatch);
  this.playback_mode = false;
  this._currentSceneIndex = -1;

  var timelineElement = document.createElement("div");
  timelineElement.className = "timeline_storyteller";
  parentElement.appendChild(timelineElement);

  this._colorPicker = colorPickerPopup(timelineElement);
  this._container =
    selectWithParent()
      .append("div")
      .attr("class", "timeline_storyteller-container");
  this._errorArea = this._container.append("div")
    .attr("class", "timeline_storyteller-error");

  this._component_width = parentElement.clientWidth;
  this._component_height = parentElement.clientHeight;
  this._render_width = this._component_width;
  this._render_height = this._component_height;

  this.options = clone(TimelineStoryteller.DEFAULT_OPTIONS);

  globals.serverless = isServerless;
  // if (typeof isServerless === "undefined" || isServerless === false) {
  //   globals.socket = require("socket.io")({ transports: ["websocket"] });
  // }

  // if (globals.socket) {
  //   globals.socket.on("hello_from_server", function (data) {
  //     log(data);
  //   });
  // }

  /**
   * Creates the import panel
   * @returns {void}
   */
  function createImportPanel() {
    var element = selectWithParent()
      .append("div")
      .attr("id", "import_div")
      .attr("class", "control_div")
      .style("top", "25%");

    var panel = {
      visible: true,
      element: element,
      show: function () {
        panel.visible = true;
        element.style("top", "25%").style("display", "block");
      },
      hide: function () {
        panel.visible = false;
        element.style("top", "-210px");
      }
    };
    return panel;
  }

  function showDemoData() {
    return (typeof showDemo === "undefined" || showDemo) && (<any>window).timeline_story_demo_data !== undefined;
  }

  function showDemoStory() {
    return (typeof showDemo === "undefined" || showDemo) && (<any>window).timeline_story_demo_story !== undefined;
  }

  instance._showDemoStory = showDemoStory;
  instance._showDemoData = showDemoData;

  function adjustSvgSize() {
    main_svg.transition()
      .duration(instance._getAnimationStepDuration())
      .attr("width", d3.max([globals.width, (instance._render_width - globals.margin.left - globals.margin.right - getScrollbarWidth())]))
      .attr("height", d3.max([globals.height, (instance._component_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth())]));
  }

  instance._adjustSvgSize = adjustSvgSize;

  (<any>Date.prototype).stdTimezoneOffset = function () { // eslint-disable-line no-extend-native
    var jan = new Date(this.getFullYear(), 0, 1);
    var jul = new Date(this.getFullYear(), 6, 1);
    return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  };

  (<any>Date.prototype).dst = function () { // eslint-disable-line no-extend-native
    return this.getTimezoneOffset() < this.stdTimezoneOffset();
  };

  // window.addEventListener("load", function () {
  //   logEvent("Initializing Timeline Storyteller");

  //   if (globals.socket) {
  //     globals.socket.emit("hello_from_client", { hello: "server" });
  //   }

  //   instance._onResized(false);
  // });

  instance._container.on("scroll", function () {
    var axis = instance._container.select(".timeline_axis");
    axis
      .select(".domain")
      .attr("transform", function () {
        return "translate(0," + instance._container.node().scrollTop + ")";
      });

    axis
      .selectAll(".tick text")
      .attr("y", instance._container.node().scrollTop - 6);
  });

  var legendDrag = d3.behavior.drag()
    .origin(function () {
      var t = d3.select(this);

      return {
        x: t.attr("x"),
        y: t.attr("y")
      };
    })
    .on("drag", function () {
      var x_pos = d3.event.x;
      var y_pos = d3.event.y;

      if (x_pos < 0) {
        x_pos = 0;
      } else if (x_pos > (globals.width - globals.margin.right)) {
        x_pos = globals.width - globals.margin.right;
      }

      if (y_pos < 0) {
        y_pos = 0;
      }

      d3.select(this)
        .attr("x", x_pos)
        .attr("y", y_pos);
    })
    .on("dragend", function () {
      globals.legend_x = d3.select(this).attr("x");
      globals.legend_y = d3.select(this).attr("y");

      //logEvent("legend moved to: " + globals.legend_x + ", " + globals.legend_y, "legend");
    });

  var filterDrag = d3.behavior.drag()
    .origin(function () {
      var t = selectWithParent("#filter_div");

      return {
        x: parseInt(t.style("left"), 10),
        y: parseInt(t.style("top"), 10)
      };
    })
    .on("drag", function () {
      var x_pos = d3.event.x;
      var y_pos = d3.event.y;

      if (x_pos < (10 + parseInt(selectWithParent("#menu_div").style("width"), 10) + 10)) {
        x_pos = (10 + parseInt(selectWithParent("#menu_div").style("width"), 10) + 10);
      } else if (x_pos >= globals.effective_filter_width) {
        x_pos = globals.effective_filter_width - 10;
      }

      if (y_pos < (180 + parseInt(selectWithParent("#option_div").style("height"), 10) + 20)) {
        y_pos = (180 + parseInt(selectWithParent("#option_div").style("height"), 10) + 20);
      } else if (y_pos >= globals.effective_filter_height + 155) {
        y_pos = globals.effective_filter_height + 155;
      }

      selectWithParent("#filter_div")
        .style("left", x_pos + "px")
        .style("top", y_pos + "px");
    })
    .on("dragend", function () {
      var filter_x = selectWithParent("#filter_div").style("left");
      var filter_y = selectWithParent("#filter_div").style("top");

      //logEvent("filter options moved to: " + filter_x + ", " + filter_y, "filter");
    });

  /**
  --------------------------------------------------------------------------------------
  KEY PRESS EVENTS
  --------------------------------------------------------------------------------------
  **/

  selectWithParent().on("keydown", function () {
    if (d3.event.keyCode === 76 && d3.event.altKey) {
      // recover legend
      selectWithParent(".legend")
        .transition()
        .duration(instance._getAnimationStepDuration())
        .attr("x", 0)
        .attr("y", 0);

      globals.legend_x = 0;
      globals.legend_y = 0;
    }
    if (d3.event.keyCode === 82 && d3.event.altKey) {
      // recover legend
      if (!instance.playback_mode) {
        instance._recordScene();
      }
    } else if (instance.playback_mode && d3.event.keyCode === 39) {
      goNextScene();
    } else if (instance.playback_mode && d3.event.keyCode === 37) {
      goPreviousScene();
    } else if (d3.event.keyCode === 80 && d3.event.altKey) {
      instance.setPlaybackMode(!instance.playback_mode);
    }
    // else if (d3.event.keyCode === 46 && selectWithParent("#caption_div").style("display") === "none" && instance._addImagePopup.hidden() && !instance.importPanel.visible) {
    //   globals.deleteScene();
    // }
  });

  function goNextScene() {
    if (globals.scenes.length < 2) {
      return;
    } else if (instance._currentSceneIndex < globals.scenes.length - 1) {
      instance._currentSceneIndex++;
    } else {
      instance._currentSceneIndex = 0;
    }
    //logEvent("scene: " + (instance._currentSceneIndex + 1) + " of " + globals.scenes.length, "playback");

    changeScene(instance._currentSceneIndex);
  }

  function goPreviousScene() {
    if (globals.scenes.length < 2) {
      return;
    }
    if (instance._currentSceneIndex > 0) {
      instance._currentSceneIndex--;
    } else {
      instance._currentSceneIndex = globals.scenes.length - 1;
    }
    //logEvent("scene: " + instance._currentSceneIndex + " of " + globals.scenes.length, "playback");

    changeScene(instance._currentSceneIndex);
  }

  // initialize main visualization containers
  var main_svg,
    export_div,
    menu_div,
    filter_div,
    navigation_div;

  gif.on("finished", function (blob) {
    var saveLink = document.createElement("a");
    var downloadSupported = "download" in saveLink;
    if (downloadSupported) {
      saveLink.download = "timeline_story.gif";
      saveLink.href = URL.createObjectURL(blob);
      saveLink.style.display = "none";
      document.querySelector(".timeline_storyteller").appendChild(saveLink);
      saveLink.click();
      document.querySelector(".timeline_storyteller").removeChild(saveLink);
    } else {
      window.open(URL.createObjectURL(blob), "_temp", "menubar=no,toolbar=no,status=no");
    }

    var reader = new window.FileReader();
    let base64data: any = "";
    reader.readAsDataURL(blob);
    reader.onloadend = function () {
      base64data = reader.result;
      var research_copy = {};
      if (!globals.opt_out) {
        research_copy = {
          "timeline_json_data": globals.timeline_json_data,
          "name": "timeline_story.gif",
          "usage_log": globals.usage_log,
          "image": base64data,
          "email_address": globals.email_address,
          "timestamp": new Date().valueOf()
        };
      } else {
        research_copy = {
          "usage_log": globals.usage_log,
          "email_address": globals.email_address,
          "timestamp": new Date().valueOf()
        };
      }
      var research_copy_json = JSON.stringify(research_copy);
      // var research_blob = new Blob([research_copy_json], { type: "application/json" });

      //log(research_copy);

      // if (globals.socket) {
      //   globals.socket.emit("export_event", research_copy_json); // raise an event on the server
      // }
    };

    gif.running = false;
  });

  this.onIntro = true;

  instance.importPanel = createImportPanel();

  export_div = selectWithParent()
    .append("div")
    .attr("id", "export_div")
    .attr("class", "control_div")
    .style("top", -185 + "px");

  menu_div = selectWithParent()
    .append("div")
    .attr("id", "menu_div")
    .attr("class", "control_div");

  var control_panel = instance._control_panel = menu_div.append("g");

  var menuItems = instance.options.menu;
  instance._initializeMenu(menuItems);

  /**
  ---------------------------------------------------------------------------------------
  EXPORT OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  selectWithParent("#export_div").append("input")
    .attr({
      type: "image",
      name: "Hide export panel",
      id: "export_close_btn",
      class: "img_btn_enabled",
      src: imageUrls("close.png"),
      height: 15,
      width: 15,
      title: "Hide export panel"
    })
    .style("margin-top", "5px")
    .on("click", function () {
      selectWithParent("#export_div").style("top", -185 + "px");

      //logEvent("hide export panel", "export");
    });

  export_div.append("div")
    .attr("id", "export_boilerplate")
    .style("height", "120px")
    .html("<span class='boilerplate_title'>Export options</span><hr>" +
      "<span class='disclaimer_text'>By providing an email address you agree that <a title='Microsoft' href='http://microsoft.com'>Microsoft</a> may contact you to request feedback and for user research.<br>" +
      "You may withdraw this consent at any time.</span><hr>");

  var export_formats = export_div.append("div")
    .attr("id", "export_formats");

  export_formats.append("input")
    .attr({
      type: "text",
      placeholder: "email address",
      class: "text_input",
      id: "email_input"
    })
    .on("input", function () {
      var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      if (re.test(selectWithParent("#email_input").property("value"))) {
        globals.email_address = selectWithParent("#email_input").property("value");
        export_formats.selectAll(".img_btn_disabled")
          .attr("class", "img_btn_enabled");

        //logEvent("valid email address: " + globals.email_address, "export");
      } else {
        export_formats.selectAll(".img_btn_enabled")
          .attr("class", "img_btn_disabled");
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export PNG",
      class: "img_btn_disabled export--image",
      src: imageUrls("png.png"),
      height: 30,
      width: 30,
      title: "Export PNG"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        //logEvent("exporting main_svg as PNG", "export");

        svgImageUtils.saveSvgAsPng(document.querySelector(".timeline_storyteller #main_svg"), "timeline_image.png", { backgroundColor: "white" });
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export SVG",
      class: "img_btn_disabled export--image",
      src: imageUrls("svg.png"),
      height: 30,
      width: 30,
      title: "Export SVG"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        //logEvent("exporting main_svg as SVG", "export");

        svgImageUtils.saveSvg(document.querySelector(".timeline_storyteller #main_svg"), "timeline_image.svg", { backgroundColor: "white" });
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export animated GIF",
      class: "img_btn_disabled export--image",
      src: imageUrls("gif.png"),
      height: 30,
      width: 30,
      title: "Export animated GIF"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        gif.frames = [];
        var gif_scenes = globals.scenes;
        if (gif_scenes.length > 0) {
          //logEvent("exporting story as animated GIF", "export");

          gif_scenes.sort(function (a, b) {
            return parseFloat(a.s_order) - parseFloat(b.s_order);
          });
          gif_scenes.forEach(function (d, i) {
            var img = document.createElement("img");
            img.style.display = "none";
            img.id = "gif_frame" + i;
            img.src = d.s_src;
            document.querySelector(".timeline_storyteller").appendChild(img);
            selectWithParent("#gif_frame" + i).attr("class", "gif_frame");
            setTimeout(function () {
              gif.addFrame(document.getElementById("gif_frame" + i), { delay: 1500 });
            }, 150);
          });
        } else {
          //logEvent("exporting main_svg as GIF", "export");

          svgImageUtils.svgAsPNG(document.querySelector(".timeline_storyteller #main_svg"), -1, { backgroundColor: "white" });

          setTimeout(function () {
            gif.addFrame(document.getElementById("gif_frame-1"));
          }, 150);
        }
        setTimeout(function () {
          gif.render();
          selectAllWithParent(".gif_frame").remove();
        }, 150 + 150 * gif.frames.length);
        gif_scenes = [];
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export story",
      class: "img_btn_disabled",
      src: imageUrls("story.png"),
      height: 30,
      width: 30,
      title: "Export story"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        //logEvent("exporting story as .cdc", "export");

        globals.timeline_story = instance.saveState();

        var story_json = JSON.stringify(globals.timeline_story);
        var blob = new Blob([story_json], { type: "application/json" });
        var url = URL.createObjectURL(blob);

        var a = document.createElement("a");
        a.download = "timeline_story.cdc";
        a.href = url;
        a.textContent = "Download timeline_story.cdc";
        document.querySelector(".timeline_storyteller").appendChild(a);
        a.click();
        document.querySelector(".timeline_storyteller").removeChild(a);

        if (globals.opt_out) {
          globals.timeline_story = {
            "usage_log": globals.usage_log,
            "author": globals.email_address,
            "timestamp": new Date().valueOf()
          };
        }

        story_json = JSON.stringify(globals.timeline_story);

        //log(story_json);

        // if (globals.socket) {
        //   globals.socket.emit("export_event", story_json); // raise an event on the server
        // }
      }
    });

  var out_out_cb = export_formats.append("div")
    .attr("id", "opt_out_div");

  out_out_cb.append("input")
    .attr({
      type: "checkbox",
      name: "opt_out_cb",
      value: globals.opt_out
    })
    .property("checked", false)
    .on("change", function () {
      if (!globals.opt_out) {
        //logEvent("opting out of sharing content", "export");

        globals.opt_out = true;
        export_formats.selectAll(".img_btn_disabled")
          .attr("class", "img_btn_enabled");
      } else {
        globals.opt_out = false;

        //logEvent("opting into sharing content", "export");

        export_formats.selectAll(".img_btn_enabled")
          .attr("class", "img_btn_disabled");
      }
    });

  out_out_cb.append("label")
    .attr("class", "menu_label")
    .attr("for", "opt_out_cb")
    .style("vertical-align", "text-top")
    .text(" Don't share content with Microsoft");


  /**
  ---------------------------------------------------------------------------------------
  OPTIONS DIV
  ---------------------------------------------------------------------------------------
  **/

  selectWithParent()
    .append("div")
    .attr("id", "option_div")
    .attr("class", "control_div");

  /**
  ---------------------------------------------------------------------------------------
  CAPTION OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  selectWithParent()
    .append("div")
    .attr("id", "caption_div")
    .attr("class", "annotation_div control_div")
    .style("display", "none");

  /**
  ---------------------------------------------------------------------------------------
  IMAGE OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  instance._addImagePopup = addImagePopup();
  selectWithParent().node().appendChild(instance._addImagePopup.element.node());
  instance._addImagePopup.on("imageSelected", instance._onAddImageSelected.bind(this));

  /**
  --------------------------------------------------------------------------------------
  DATASETS
  --------------------------------------------------------------------------------------
  **/

  selectWithParent().append("div")
    .attr("id", "logo_div")
    .html("<a href='https://microsoft.com'><img class='ms-logo' src='" + imageUrls("ms-logo.svg") + "'></a>");

  var footer = selectWithParent().append("div")
    .attr("id", "footer");

  footer.append("div")
    .attr("id", "footer_left")
    .html("<span class='footer_text_left'><a title=About & getting started' href='../../' target='_blank'>About & getting started</a></span> <span class='footer_text_left'><a title='Contact the project team' href='mailto:timelinestoryteller@microsoft.com' target='_top'>Contact the project team</a>");

  footer.append("div")
    .attr("id", "footer_right")
    .html("<span class='footer_text'><a title='Privacy & cookies' href='https://go.microsoft.com/fwlink/?LinkId=521839' target='_blank'>Privacy & cookies</a></span><span class='footer_text'><a title='Terms of use' href='https://go.microsoft.com/fwlink/?LinkID=760869' target='_blank'>Terms of use</a></span><span class='footer_text'><a title='Trademarks' href='http://go.microsoft.com/fwlink/?LinkId=506942' target='_blank'>Trademarks</a></span><span class='footer_text'><a title='About our ads' href='http://choice.microsoft.com/' target='_blank'>About our ads</a></span><span class='footer_text'>© 2017 Microsoft</span>");

  var boilerplate = instance.importPanel.element.append("div")
    .attr("id", "boilerplate")
    .html("<span class='boilerplate_title'>Timeline Storyteller (Alpha)</span>");

  boilerplate.append("input")
    .attr({
      type: "image",
      name: "Hide import panel",
      id: "import_close_btn",
      class: "img_btn_enabled",
      src: imageUrls("close.png"),
      height: 15,
      width: 15,
      title: "Hide import panel"
    })
    .style("margin-top", "5px")
    .on("click", function () {
      //logEvent("hiding import panel", "load");

      instance.importPanel.hide();

      selectWithParent("#gdocs_info").style("height", 0 + "px");
      selectAllWithParent(".gdocs_info_element").style("display", "none");
    });

  instance._initializeImportPanel();

  var gdocs_info = instance.importPanel.element.append("div")
    .attr("id", "gdocs_info");

  gdocs_info.append("div")
    .attr("id", "gdoc_spreadsheet_key_div")
    .attr("class", "gdocs_info_element")
    .append("input")
    .attr({
      type: "text",
      placeholder: "Published spreadsheet URL",
      class: "text_input",
      id: "gdoc_spreadsheet_key_input"
    });

  gdocs_info.append("div")
    .attr("id", "gdoc_spreadsheet_title_div")
    .attr("class", "gdocs_info_element")
    .append("input")
    .attr({
      type: "text",
      placeholder: "OPTIONAL: Worksheet title (tab name)",
      class: "text_input",
      id: "gdoc_worksheet_title_input"
    });

  gdocs_info.append("div")
    .attr("id", "gdoc_spreadsheet_confirm_div")
    .attr("class", "gdocs_info_element")
    .style("width", "20px")
    .append("input")
    .attr({
      type: "image",
      name: "Confirm Google Spreadsheet Data",
      id: "confirm_gdocs_btn",
      class: "img_btn_enabled",
      src: imageUrls("check.png"),
      height: 20,
      width: 20,
      title: "Confirm Google Spreadsheet Data"
    })
    .on("click", function () {
      globals.gdoc_key = selectWithParent("#gdoc_spreadsheet_key_input").property("value");
      globals.gdoc_key = globals.gdoc_key.replace(/.*\/d\//g, "");
      globals.gdoc_key = globals.gdoc_key.replace(/\/.*$/g, "");
      globals.gdoc_worksheet = selectWithParent("#gdoc_worksheet_title_input").property("value");
      //logEvent("gdoc spreadsheet " + globals.gdoc_worksheet + " added using key \"" + globals.gdoc_key + "\"", "load");

      if (globals.gdoc_worksheet !== "") {
        gsheets.getWorksheet(globals.gdoc_key, globals.gdoc_worksheet, function (err, sheet) {
          if (err !== null) {
            alert(err); // eslint-disable-line no-alert
            return true;
          }
          setTimeout(function () {
            instance.load({ timeline_json_data: sheet.data }, false);
          }, 500);
        });
      } else {
        var worksheet_id;

        gsheets.getSpreadsheet(globals.gdoc_key, function (err, sheet) {
          if (err !== null) {
            alert(err); // eslint-disable-line no-alert
            return true;
          }

          //log("worksheet id: " + sheet.worksheets[0].id);

          setTimeout(function () {
            worksheet_id = sheet.worksheets[0].id;
            gsheets.getWorksheetById(globals.gdoc_key, worksheet_id, function (err2, sheetWithData) {
              if (err2 !== null) {
                alert(err2); // eslint-disable-line no-alert
                return true;
              }

              globals.timeline_json_data = sheetWithData.data;
              setTimeout(function () {
                instance.load({ timeline_json_data: sheetWithData.data }, false);
              }, 500);
            });
          }, 500);
        });
      }
    });

  instance.importPanel.element.append("div")
    .attr("class", "loading_data_indicator")
    .style("display", "none")
    .html("<span>Loading data...</span>");

  instance.importPanel.element.append("div")
    .attr("id", "disclaimer")
    .html("<span class='disclaimer_title'style='clear:both'>An expressive visual storytelling environment for presenting timelines.</span><span class='disclaimer_text'><br><strong>A note about privacy</strong>: </span>" +
      "<span class='disclaimer_text'>Your data remains on your machine and is not shared with <a title='Microsoft' href='http://microsoft.com'>Microsoft</a> unless you export the content you create and provide your email address. If you share your content with <a title='Microsoft' href='http://microsoft.com'>Microsoft</a>, we will use it for research and to improve our products and services. We may also include it in a future research publication. " +
      "By using this service, you agree to <a title='Microsoft' href='http://microsoft.com'>Microsoft</a>'s <a title='Privacy' href='https://go.microsoft.com/fwlink/?LinkId=521839'>Privacy Statement</a> and <a title='Terms of Use' href='https://go.microsoft.com/fwlink/?LinkID=760869'>Terms of Use</a>.</span>");

  var timeline_metadata = instance.importPanel.element.append("div")
    .attr("id", "timeline_metadata")
    .style("display", "none");

  timeline_metadata.append("div")
    .attr("id", "timeline_metadata_contents");

  timeline_metadata.append("div")
    .attr({
      id: "draw_timeline",
      class: "img_btn_enabled import_label",
      title: "Draw Timeline"
    })
    .on("click", function () {
      selectWithParent("#gdocs_info").style("height", 0 + "px");
      selectWithParent("#gdoc_spreadsheet_key_input").property("value", "");
      selectWithParent("#gdoc_worksheet_title_input").property("value", "");
      selectAllWithParent(".gdocs_info_element").style("display", "none");

      drawTimeline(globals.active_data);

      instance.setPlaybackMode(false, false);

      updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
    })
    .append("text")
    .attr("class", "boilerplate_title")
    .style("color", "white")
    .style("cursor", "pointer")
    .style("position", "relative")
    .text("Draw this timeline");

  /**
  --------------------------------------------------------------------------------------
  TIMELINE CONFIG OPTIONS UI
  --------------------------------------------------------------------------------------
  **/

  var option_picker = selectWithParent("#option_div");

  // representation options
  var representation_picker = option_picker.append("div")
    .attr("class", "option_picker")
    .attr("id", "representation_picker");

  representation_picker.append("text")
    .attr("class", "ui_label")
    .text("Timeline representation");

  var representation_rb = representation_picker.selectAll("div")
    .data(globals.representations)
    .enter();

  var representation_rb_label = representation_rb.append("label")
    .attr("class", "option_rb")
    .on("mouseover", function (d) {
      var pos_x = this.getBoundingClientRect().left;
      var offset_x = 0;
      if (pos_x > globals.width / 2) {
        offset_x = pos_x - 235;
      } else {
        offset_x = pos_x + 53;
      }
      var offset_y = this.getBoundingClientRect().top;
      selectWithParent().append("div")
        .attr("id", "rb_hint")
        .style("left", offset_x + "px")
        .style("top", offset_y + "px")
        .attr("class", function () {
          if (pos_x > globals.width / 2) {
            return "rb_hint_right";
          }
          return "rb_hint_left";
        })
        .style("text-align", function () {
          if (pos_x > globals.width / 2) {
            return "right";
          }
          return "left";
        })
        .html(d.hint);
    })
    .on("mouseout", function () {
      selectWithParent("#rb_hint").remove();
    });

  representation_rb_label.append("input")
    .attr({
      type: "radio",
      name: "representation_rb",
      value: function (d) {
        return d.name;
      }
    })
    .property("checked", function (d) {
      return d.name === timeline_vis.tl_representation();
    })
    .property("disabled", true);

  representation_rb_label.append("img")
    .attr({
      height: 40,
      width: 40,
      class: "img_btn_disabled",
      src: function (d) {
        return d.icon;
      }
    });

  representation_rb_label.append("span")
    .attr("class", "option_rb_label")
    .text(function (d) {
      return d.name;
    });

  // scale options
  var scale_picker = option_picker.append("div")
    .attr("class", "option_picker")
    .attr("id", "scale_picker");

  scale_picker.append("text")
    .attr("class", "ui_label")
    .text("Scale");

  var scale_rb = scale_picker.selectAll("div")
    .data(globals.scales)
    .enter();

  var scale_rb_label = scale_rb.append("label")
    .attr("class", "option_rb")
    .on("mouseover", function (d) {
      var pos_x = this.getBoundingClientRect().left;
      var offset_x = 0;
      if (pos_x > globals.width / 2) {
        offset_x = pos_x - 235;
      } else {
        offset_x = pos_x + 53;
      }
      var offset_y = this.getBoundingClientRect().top;
      selectWithParent().append("div")
        .attr("id", "rb_hint")
        .style("left", offset_x + "px")
        .style("top", offset_y + "px")
        .attr("class", function () {
          if (pos_x > globals.width / 2) {
            return "rb_hint_right";
          }
          return "rb_hint_left";
        })
        .style("text-align", function () {
          if (pos_x > globals.width / 2) {
            return "right";
          }
          return "left";
        })
        .html(d.hint);
    })
    .on("mouseout", function () {
      selectWithParent("#rb_hint").remove();
    });

  scale_rb_label.append("input")
    .attr({
      type: "radio",
      name: "scale_rb",
      value: function (d) {
        return d.name;
      }
    })
    .property("checked", function (d) {
      return d.name === timeline_vis.tl_scale();
    })
    .property("disabled", true);

  scale_rb_label.append("img")
    .attr({
      height: 40,
      width: 40,
      class: "img_btn_disabled",
      src: function (d) {
        return d.icon;
      }
    });

  scale_rb_label.append("span")
    .attr("class", "option_rb_label")
    .text(function (d) {
      return d.name;
    });

  // layout options
  var layout_picker = option_picker.append("div")
    .attr("class", "option_picker")
    .style("border-right", "none")
    .attr("id", "layout_picker");

  layout_picker.append("text")
    .attr("class", "ui_label")
    .text("Layout");

  var layout_rb = layout_picker.selectAll("div")
    .data(globals.layouts)
    .enter();

  var layout_rb_label = layout_rb.append("label")
    .attr("class", "option_rb")
    .on("mouseover", function (d) {
      var pos_x = this.getBoundingClientRect().left;
      var offset_x = 0;
      if (pos_x > globals.width / 2) {
        offset_x = pos_x - 235;
      } else {
        offset_x = pos_x + 53;
      }
      var offset_y = this.getBoundingClientRect().top;
      selectWithParent().append("div")
        .attr("id", "rb_hint")
        .attr("class", function () {
          if (pos_x > globals.width / 2) {
            return "rb_hint_right";
          }
          return "rb_hint_left";
        })
        .style("left", offset_x + "px")
        .style("top", offset_y + "px")
        .style("text-align", function () {
          if (pos_x > globals.width / 2) {
            return "right";
          }
          return "left";
        })
        .html(d.hint);
    })
    .on("mouseout", function () {
      selectWithParent("#rb_hint").remove();
    });

  layout_rb_label.append("input")
    .attr({
      type: "radio",
      name: "layout_rb",
      value: function (d) {
        return d.name;
      }
    })
    .property("checked", function (d) {
      return d.name === timeline_vis.tl_layout();
    })
    .property("disabled", true);

  layout_rb_label.append("img")
    .attr({
      height: 40,
      width: 40,
      class: "img_btn_disabled",
      src: function (d) {
        return d.icon;
      }
    });

  layout_rb_label.append("span")
    .attr("class", "option_rb_label")
    .text(function (d) {
      return d.name;
    });

  selectWithParent("#caption_div").append("textarea")
    .attr({
      cols: 37,
      rows: 5,
      placeholder: "Caption text",
      class: "text_input",
      maxlength: 140,
      id: "add_caption_text_input"
    });

  selectWithParent("#caption_div").append("input")
    .attr({
      type: "image",
      name: "Add Caption",
      id: "add_caption_btn",
      class: "img_btn_enabled",
      src: imageUrls("check.png"),
      height: 20,
      width: 20,
      title: "Add Caption"
    })
    .on("click", function () {
      selectWithParent("#caption_div").style("display", "none");
      var caption = selectWithParent("#add_caption_text_input").property("value");
      //logEvent("caption added: \"" + caption + "\"", "annotation");

      let highestCaptionId = getHighestId(globals.caption_list);

      var caption_list_item = {
        id: highestCaptionId + 1,
        caption_text: caption,
        x_rel_pos: 0.5,
        y_rel_pos: 0.25,
        caption_width: d3.min([caption.length * 10, 200]),
        z_index: getNextZIndex()
      };

      globals.caption_list.push(caption_list_item);

      addCaption(caption, d3.min([caption.length * 10, 200]), 0.5, 0.25, caption_list_item);
      selectWithParent("#add_caption_text_input").property("value", "");
    });


  /**
  --------------------------------------------------------------------------------------
  MAIN PREPROCESSING
  --------------------------------------------------------------------------------------
  **/

  function loadTimeline(state, skipConfig) {
    instance._loaded = false;

    instance._hideError();

    var loadDataIndicator = selectWithParent(".loading_data_indicator");
    loadDataIndicator.style("display", "block");

    // Allow the user to configure the timeline first
    if (!skipConfig) {
      instance.importPanel.show();
    } else {
      instance.importPanel.hide();
    }

    instance._component_width = parentElement.clientWidth;
    instance._component_height = parentElement.clientHeight;

    instance.onIntro = false;

    // Give it some time to render the "load data" indicator
    return new Promise<void>(resolve => {
      setTimeout(function () {
        try {
          selectWithParent("#disclaimer").style("display", "none");
          selectWithParent("#timeline_metadata_contents").html("");
          control_panel.selectAll("input").attr("class", "img_btn_disabled");
          selectWithParent("#filter_type_picker").selectAll("input").property("disabled", true);
          selectWithParent("#filter_type_picker").selectAll("img").attr("class", "img_btn_disabled");
          selectWithParent("#playback_bar").selectAll("img").attr("class", "img_btn_disabled");
          selectAllWithParent(".option_rb").select("input").property("disabled", "true");
          selectAllWithParent(".option_rb").select("img").attr("class", "img_btn_disabled");
          selectAllWithParent(".option_rb img").style("border", "2px solid transparent");
          selectWithParent("#menu_div").style("left", -50 + "px");
          selectWithParent("#navigation_div").style("bottom", -100 + "px");
          globals.use_custom_palette = false;

          if (main_svg !== undefined) {
            // console.clear();
            main_svg.remove();
            filter_div.remove();
            navigation_div.remove();
            timeline_vis.prev_tl_representation("None");

            // If we have no scenes, reset everything to default
            if (!(state.scenes && state.scenes.length)) {
              instance._currentSceneIndex = -1;
              globals.gif_index = 0;
              globals.scenes = [];
              globals.caption_list = [];
              globals.image_list = [];
              globals.annotation_list = [];
              timeline_vis.tl_scale("Chronological")
                .tl_layout("Unified")
                .tl_representation("Linear");
              selectAllWithParent(".gif_frame").remove();
              timeline_vis.resetCurve();
            }
          }

          if (globals.legend_panel !== undefined) {
            globals.legend_panel.remove();
          }

          filter_div = selectWithParent()
            .append("div")
            .attr("id", "filter_div")
            .attr("class", "control_div")
            .style("display", "none")
            .style("transition", "all 0.05s ease")
            .style("-webkit-transition", "all 0.05s ease");

          // initialize global variables accessed by multiple visualziations
          globals.date_granularity = "years";
          globals.max_num_tracks = 0;
          globals.max_end_age = 0;
          globals.max_num_seq_tracks = 0;
          globals.legend_rect_size = globals.unit_width;
          globals.legend_spacing = 5;
          globals.categories = undefined;
          globals.categories = d3.scale.ordinal(); // scale for event types
          if (globals.color_palette !== undefined) {
            globals.categories.range(globals.color_palette);
          }
          globals.facets = d3.scale.ordinal(); // scale for facets (timelines)
          globals.segments = d3.scale.ordinal(); // scale for segments
          globals.present_segments = d3.scale.ordinal();
          globals.num_categories = 0;
          globals.num_facets = 0;
          globals.timeline_facets = [];

          instance._main_svg = main_svg = instance._container
            .append("svg")
            .attr("id", "main_svg");

          navigation_div = selectWithParent()
            .append("div")
            .attr("id", "navigation_div")
            .attr("class", "control_div");

          var playback_bar = navigation_div.append("div")
            .attr("id", "playback_bar");

          playback_bar.append("div")
            .attr("id", "record_scene_div")
            .attr("class", "nav_bttn")
            .append("img")
            .attr({
              id: "record_scene_btn",
              class: "img_btn_disabled",
              src: imageUrls("record.png"),
              height: 20,
              width: 20,
              title: "Record Scene"
            })
            .on("click", function () {
              if (!instance.playback_mode) {
                instance._recordScene();
              }
            });

          playback_bar.append("div")
            .attr("id", "prev_scene_div")
            .attr("class", "nav_bttn")
            .append("img")
            .attr("id", "prev_scene_btn")
            .attr("height", 20)
            .attr("width", 20)
            .attr("src", imageUrls("prev.png"))
            .attr("class", "img_btn_disabled")
            .attr("title", "Previous Scene")
            .on("click", function () {
              goPreviousScene();
            });

          playback_bar.append("div")
            .attr("id", "next_scene_div")
            .attr("class", "nav_bttn")
            .append("img")
            .attr("height", 20)
            .attr("width", 20)
            .attr("class", "img_btn_disabled")
            .attr("id", "next_scene_btn")
            .attr("src", imageUrls("next.png"))
            .attr("title", "Next Scene")
            .on("click", function () {
              goNextScene();
            });

          var playback_cb = playback_bar.append("div")
            .attr("id", "playback_div")
            .attr("class", "nav_bttn");

          var playback_cb_label = playback_cb.append("label")
            .attr("class", "nav_cb");

          playback_cb_label.append("input")
            .attr({
              type: "checkbox",
              name: "playback_cb",
              value: instance.playback_mode
            })
            .property("checked", false)
            .on("change", function () {
              instance.setPlaybackMode(!instance.playback_mode);
            });

          playback_cb_label.append("img")
            .attr({
              id: "play_scene_btn",
              class: "img_btn_disabled",
              src: imageUrls("play.png"),
              height: 20,
              width: 20,
              title: "Toggle Playback Mode"
            });

          playback_bar.append("div")
            .attr("id", "stepper_container")
            // .style('width', function () {
            //   return (globals.window_width * 0.9 - 120 - 12) + 'px';
            // })
            .append("svg")
            .attr("id", "stepper_svg")
            .append("text")
            .attr("id", "stepper_svg_placeholder")
            .attr("y", 25)
            .attr("dy", "0.25em")
            .text("Recorded timeline scenes will appear here.");

          window.addEventListener("resize", function () {
            selectWithParent("#stepper_container").style("width", function () {
              return (instance._render_width * 0.9 - 120 - 12 - 5) + "px";
            });
            instance._onResized();
          });

          var defs = main_svg.append("defs");

          var filter = defs.append("filter")
            .attr("id", "drop-shadow")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", "200%")
            .attr("height", "200%");

          // translate output of Gaussian blur to the right and downwards with 2px
          // store result in offsetBlur
          filter.append("feOffset")
            .attr("in", "SourceAlpha")
            .attr("dx", 2.5)
            .attr("dy", 2.5)
            .attr("result", "offOut");

          filter.append("feGaussianBlur")
            .attr("in", "offOut")
            .attr("stdDeviation", 2.5)
            .attr("result", "blurOut");

          filter.append("feBlend")
            .attr("in", "SourceGraphic")
            .attr("in2", "blurOut")
            .attr("mode", "normal");

          defs.append("filter")
            .attr("id", "greyscale")
            .append("feColorMatrix")
            .attr("type", "matrix")
            .attr("dur", "0.5s")
            .attr("values", "0.4444 0.4444 0.4444 0 0 0.4444 0.4444 0.4444 0 0 0.4444 0.4444 0.4444 0 0 0 0 0 1 0");

          /**
          ---------------------------------------------------------------------------------------
          LOAD DATA
          ---------------------------------------------------------------------------------------
          **/
          if (state) {
            instance._loadTimelineFromState(state, instance._render_height);

            // if we have scenes to show, we don't need the tooltip
            if (state.scenes && state.scenes.length) {
              selectWithParent("#stepper_svg_placeholder").remove();
            }
          }
        } finally {
          // Reapply the UI scale to new elements
          instance.setUIScale(instance.scale);

          loadDataIndicator.style("display", "none");
          instance.applyOptions();

          if (skipConfig) {
            drawTimeline(globals.active_data).then(resolve);
          }

          // call this again afterward, cause some elements are created in loadTimeline function
          // and we need to ensure they are hidden/visible
          instance.setPlaybackMode(instance.playback_mode, false);

          instance._loaded = true;

          if (!skipConfig) {
            resolve();
          }
        }
      }, 10);
    });
  }

  instance._loadTimeline = loadTimeline;

  /**
   * Preprocess data after loading
   * @param {object} data The data to preprocess
   * @param {boolean} shouldDrawTimeline If the timeline should be drawn after it is initialized
   * @returns {void}
   */
  function initTimelineData(data, shouldDrawTimeline) {
    var unique_values = d3.map([]);
    var unique_data = [];

    globals.timeline_json_data = data;

    data.forEach(function (d, i) {
      if (d && !d.hasOwnProperty("id")) {
        d.id = i;
      }
      unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
    });

    // find unique values
    unique_values.forEach(function (d) {
      unique_data.push(unique_values.get(d));
    });
    //logEvent(unique_data.length + " unique events", "preprocessing");

    processTimeline(unique_data, shouldDrawTimeline);
  }

  function processTimeline(data, shouldDrawTimeline) {
    // check for earliest and latest numerical dates before parsing
    globals.earliest_date = d3.min(data, function (d) {
      if (d.start_date instanceof Date) {
        return d.start_date;
      }
      return +d.start_date;
    });

    globals.latest_start_date = d3.max(data, function (d) {
      if (d.start_date instanceof Date) {
        return d.start_date;
      }
      return +d.start_date;
    });

    globals.latest_end_date = d3.max(data, function (d) {
      if (d.end_date instanceof Date) {
        return d.end_date;
      }
      return +d.end_date;
    });

    // set flag for really epic time scales
    if (globals.isNumber(globals.earliest_date)) {
      if (globals.earliest_date < -9999 || d3.max([globals.latest_start_date, globals.latest_end_date]) > 10000) {
        globals.date_granularity = "epochs";
      }
    }

    //log("date_granularity after: " + globals.date_granularity);

    parseDates(data); // parse all the date values, replace blank end_date values

    // set annotation counter for each item
    data.forEach(function (item) {
      item.annotation_count = 0;
    });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS CATEGORIES OF EVENTS
    ---------------------------------------------------------------------------------------
    **/

    // determine event categories from data
    globals.categories.domain(data.map(function (d) {
      return d.category;
    }));

    globals.num_categories = globals.categories.domain().length;

    globals.max_legend_item_width = 0;

    globals.categories.domain().sort().forEach(function (item) {
      var legend_dummy = document.createElement("span");
      legend_dummy.id = "legend_dummy";
      legend_dummy.style.fontSize = "12px";
      legend_dummy.style.fill = "#fff";
      legend_dummy.style.fontFamily = "Century Gothic";
      legend_dummy.innerHTML = item;
      document.querySelector(".timeline_storyteller").appendChild(legend_dummy);
      var legend_dummy_width = legend_dummy.offsetWidth;
      document.querySelector(".timeline_storyteller").removeChild(legend_dummy);

      if (legend_dummy_width > globals.max_legend_item_width) {
        globals.max_legend_item_width = legend_dummy_width;
      }
    });

    //logEvent("# categories: " + globals.num_categories, "preprocessing");

    var temp_palette;
    // assign colour labels to categories if # categories < 12
    if (globals.num_categories <= 20 && globals.num_categories >= 11) {
      temp_palette = colorSchemes.schema5();
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    } else if (globals.num_categories <= 10 && globals.num_categories >= 3) {
      temp_palette = colorSchemes.schema2();
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    } else if (globals.num_categories === 2) {
      temp_palette = ["#E45641", "#44B3C2"];
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    } else {
      temp_palette = ["#E45641"];
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    }
    if (globals.use_custom_palette) {
      globals.categories.range(globals.color_palette);
      //logEvent("custom palette: " + globals.categories.range(), "color palette");
    }

    filter_div.append("input")
      .attr({
        type: "image",
        name: "Hide filter panel",
        id: "export_close_btn",
        class: "img_btn_enabled",
        src: imageUrls("close.png"),
        height: 15,
        width: 15,
        title: "Hide filter panel"
      })
      .style("position", "absolute")
      .style("top", "0px")
      .style("left", "5px")
      .style("margin-top", "5px")
      .on("click", function () {
        selectWithParent("#filter_div").style("display", "none");

        //logEvent("hide filter panel", "export");
      });

    filter_div.append("text")
      .attr("class", "menu_label filter_label")
      .style("margin-right", "auto")
      .text("Filter Options")
      .style("cursor", "move")
      .call(filterDrag);

    filter_div.append("hr")
      .attr("class", "menu_hr");

    // filter type options
    var filter_type_picker = filter_div.append("div")
      .attr("id", "filter_type_picker")
      .attr("class", "filter_div_section");

    filter_type_picker.append("div")
      .attr("class", "filter_div_header")
      .append("text")
      .attr("class", "menu_label filter_label")
      .text("Filter Mode:");

    var filter_type_rb = filter_type_picker.selectAll("g")
      .data(["Emphasize", "Hide"])
      .enter();

    var filter_type_rb_label = filter_type_rb.append("label")
      .attr("class", "menu_rb");

    filter_type_rb_label.append("input")
      .attr({
        type: "radio",
        name: "filter_type_rb",
        value: function (d) {
          return d;
        }
      })
      .property("disabled", false)
      .property("checked", function (d) {
        return d === "Emphasize";
      });

    filter_type_rb_label.append("img")
      .attr({
        class: "img_btn_enabled",
        height: 30,
        width: 30,
        title: function (d) {
          return d;
        },
        src: function (d) {
          return imageUrls(d === "Emphasize" ? "highlight.png" : "hide.png");
        }
      })
      .style("margin-bottom", "0px");

    filter_type_rb_label.append("span")
      .attr("class", "option_rb_label")
      .html(function (d) {
        return d;
      });

    selectAllWithParent("#filter_type_picker input[name=filter_type_rb]").on("change", function () {
      const newCategories = selectWithParent("#category_picker").select("option");
      const newFacets = selectWithParent("#facet_picker").select("option");
      const newSegments = selectWithParent("#segment_picker").select("option");

      globals.filter_type = this.value;

      selectWithParent("#filter_div").style("display", "inline");

      //logEvent("filter type changed: " + this.value, "filter");

      const isHide = globals.filter_type === "Hide";
      if (!isHide) {
        globals.active_data = globals.all_data;
      }

      const trigger_remove_filter =
        globals.selected_categories[0].length !== 1 || globals.selected_categories[0][0].value !== "( All )" ||
        globals.selected_facets[0].length !== 1 || globals.selected_facets[0][0].value !== "( All )" ||
        globals.selected_segments[0].length !== 1 || globals.selected_segments[0][0].value !== "( All )";

      if (trigger_remove_filter) {
        const remove = globals.dispatch.remove;
        const emphasize = globals.dispatch.Emphasize;
        (isHide ? emphasize : remove).call(globals.dispatch, newCategories, newFacets, newSegments);
        (isHide ? remove : emphasize).call(globals.dispatch, globals.selected_categories, globals.selected_facets, globals.selected_segments);
      }
    });

    var category_filter = filter_div.append("div")
      .attr("class", "filter_div_section");

    var category_filter_header = category_filter.append("div")
      .attr("class", "filter_div_header");

    category_filter_header.append("text")
      .attr("class", "menu_label filter_label")
      .text("Category");

    category_filter_header.append("label")
      .attr("for", "category_picker")
      .style("display", "block")
      .style("margin-right", "100%")
      .attr("id", "category_picker_label")
      .append("img")
      .attr({
        name: "Filter by event category",
        class: "filter_header_icon",
        height: 30,
        width: 30,
        title: "Filter by event category",
        src: imageUrls("categories.png")
      });

    var all_categories = ["( All )"];

    category_filter.append("select")
      .attr("class", "filter_select")
      .attr("size", 8)
      .attr("id", "category_picker")
      .attr({
        multiple: true
      })
      .on("change", function () {
        instance._updateSelectedFilters(d3.select(this), "selected_categories");
      })
      .selectAll("option")
      .data(all_categories.concat(globals.categories.domain().sort()))
      .enter()
      .append("option")
      .text(function (d) { return d; })
      .property("selected", function (d) {
        return d === "( All )";
      });

    globals.selected_categories = selectWithParent("#category_picker")
      .selectAll("option")
      .filter(function () {
        return this.selected;
      });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS FACETS
    ---------------------------------------------------------------------------------------
    **/

    // determine facets (separate timelines) from data
    globals.facets.domain(data.map(function (d) {
      return d.facet;
    }));

    globals.facets.domain().sort();

    globals.num_facets = globals.facets.domain().length;
    globals.total_num_facets = globals.num_facets;
    globals.num_facet_cols = Math.ceil(Math.sqrt(globals.num_facets));
    globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

    //logEvent("# facets: " + globals.num_facets, "preprocessing");

    var facet_filter = filter_div.append("div")
      .attr("class", "filter_div_section");

    var facet_filter_header = facet_filter.append("div")
      .attr("class", "filter_div_header");

    facet_filter_header.append("text")
      .attr("class", "menu_label filter_label")
      .text("Facet");

    facet_filter_header.append("label")
      .attr("for", "facet_picker")
      .style("display", "block")
      .style("margin-right", "100%")
      .attr("id", "facet_picker_label")
      .append("img")
      .attr({
        name: "Filter by event facet",
        class: "filter_header_icon",
        height: 30,
        width: 30,
        title: "Filter by event facet",
        src: imageUrls("facets.png")
      });

    var all_facets = ["( All )"];

    facet_filter.append("select")
      .attr("class", "filter_select")
      .attr("size", 8)
      .attr("id", "facet_picker")
      .attr({
        multiple: true
      })
      .on("change", function () {
        instance._updateSelectedFilters(d3.select(this), "selected_facets");
      })
      .selectAll("option")
      .data(all_facets.concat(globals.facets.domain().sort()))
      .enter()
      .append("option")
      .text(function (d) { return d; })
      .property("selected", function (d) {
        return d === "( All )";
      });

    globals.selected_facets = selectWithParent("#facet_picker")
      .selectAll("option")
      .filter(function () {
        return this.selected;
      });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS SEGMENTS
    ---------------------------------------------------------------------------------------
    **/

    // event sorting function
    data.sort(compareAscending);

    if (globals.date_granularity === "epochs") {
      data.min_start_date = globals.earliest_date;
      data.max_start_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
      data.max_end_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
    } else {
      // determine the time domain of the data along a linear quantitative scale
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return time.minute.floor(d.end_date);
      });
    }

    // determine the granularity of segments
    globals.segment_granularity = getSegmentGranularity(data.min_start_date, data.max_end_date);

    data.forEach(function (item) {
      item.segment = getSegment(item.start_date);
    });

    var segment_list = getSegmentList(data.min_start_date, data.max_end_date);

    globals.present_segments.domain(segment_list.map(function (d) {
      return d;
    }));

    var segment_filter = filter_div.append("div")
      .attr("class", "filter_div_section");

    var segment_filter_header = segment_filter.append("div")
      .attr("class", "filter_div_header");

    segment_filter_header.append("text")
      .attr("class", "menu_label filter_label")
      .text("Segment");

    segment_filter_header.append("label")
      .attr("for", "segment_picker")
      .style("display", "block")
      .style("margin-right", "100%")
      .attr("id", "segment_picker_label")
      .append("img")
      .attr({
        name: "Filter by chronological segment",
        class: "filter_header_icon",
        height: 30,
        width: 30,
        title: "Filter by chronological segment",
        src: imageUrls("segments.png")
      });

    var all_segments = ["( All )"];

    segment_filter.append("select")
      .attr("id", "segment_picker")
      .attr("class", "filter_select")
      .attr("size", 8)
      .attr({
        multiple: true
      })
      .on("change", function () {
        instance._updateSelectedFilters(d3.select(this), "selected_segments");
      })
      .selectAll("option")
      .data(all_segments.concat(globals.present_segments.domain().sort()))
      .enter()
      .append("option")
      .text(function (d) { return d; })
      .property("selected", function (d) {
        return d === "( All )";
      });

    globals.selected_segments = selectWithParent("#segment_picker")
      .selectAll("option")
      .filter(function () {
        return this.selected;
      });

    globals.all_data = data;
    globals.active_data = globals.all_data;

    measureTimeline(globals.active_data);
    selectWithParent("#timeline_metadata").style("display", "inline");
    selectWithParent("#timeline_metadata_contents")
      .append("span")
      .attr("class", "metadata_title")
      .style("text-decoration", "underline")
      .text("About this data:");

    selectWithParent("#timeline_metadata_contents")
      .append("div")
      .attr("class", "timeline_metadata_contents_div")
      .html("<p class='metadata_content'><img src='" + imageUrls("timeline.png") + "' width='36px' style='float: left; padding-right: 5px;'/><strong>Cardinality & extent</strong>: " +
        globals.active_data.length + " unique events spanning " + globals.range_text + " <br><strong>Granularity</strong>: " + globals.segment_granularity + "</p>");

    var category_metadata = selectWithParent("#timeline_metadata_contents")
      .append("div")
      .attr("class", "timeline_metadata_contents_div")
      .style("border-top", "1px dashed #999");

    var category_metadata_p = category_metadata
      .append("p")
      .attr("class", "metadata_content")
      .html("<img src='" + imageUrls("categories.png") + "' width='36px' style='float: left; padding-right: 5px;'/><strong>Event categories</strong>: ( " + globals.num_categories + " ) <em><strong>Note</strong>: click on the swatches to assign custom colors to categories.</em><br>");

    var category_metadata_element = category_metadata_p.selectAll(".category_element")
      .data(globals.categories.domain().sort())
      .enter()
      .append("g")
      .attr("class", "category_element");

    category_metadata_element.append("div")
      .attr("class", "colorpicker_wrapper")
      .attr("filter", "url(#drop-shadow)")
      .style("background-color", globals.categories)
      .on("click", function (d, i) {
        var colorEle = this;
        instance._colorPicker.show(this, globals.categories(d), function (value) {
          // Update the display
          d3.select(colorEle).style("background-color", value);

          instance.setCategoryColor(d, i, value);
        });
      });
    //   .append("input")
    //   .attr("type", "color")
    //   .attr("class", "colorpicker")
    //   .attr("value", globals.categories)
    //   .on("change", function (d, i) {

    //   });

    category_metadata_element.append("span")
      .attr("class", "metadata_content")
      .style("float", "left")
      .text(function (d) {
        return " " + d + " ..";
      });

    category_metadata.append("p")
      .html("<br>");

    selectWithParent("#timeline_metadata_contents")
      .append("div")
      .attr("class", "timeline_metadata_contents_div")
      .style("border-top", "1px dashed #999")
      .html(
        "<p class='metadata_content'><img src='" + imageUrls("facets.png") + "' width='36px' style='float: left; padding-right: 5px;'/><strong>Timeline facets</strong>: " +
        ((globals.facets.domain().length > 1) ? ("( " + globals.num_facets + " ) " + globals.facets.domain().slice(0, 30).join(" .. ")) : "(none)") + "</p>");

    if (shouldDrawTimeline) {
      drawTimeline(globals.active_data);
    }
  }

  /**
  ---------------------------------------------------------------------------------------
  SELECT SCALE
  ---------------------------------------------------------------------------------------
  **/

  selectAllWithParent("#scale_picker input[name=scale_rb]").on("change", function () {
    instance.clearCanvas();

    //logEvent("scale change: " + this.value, "scale_change");

    determineSize(globals.active_data, this.value, timeline_vis.tl_layout(), timeline_vis.tl_representation());

    adjustSvgSize();

    main_svg.call(timeline_vis.duration(instance._getAnimationStepDuration())
      .tl_scale(this.value)
      .height(globals.height)
      .width(globals.width));

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SELECT LAYOUT
  ---------------------------------------------------------------------------------------
  **/

  selectAllWithParent("#layout_picker input[name=layout_rb]").on("change", function () {
    instance.clearCanvas();

    //logEvent("layout change: " + this.value, "layout_change");

    determineSize(globals.active_data, timeline_vis.tl_scale(), this.value, timeline_vis.tl_representation());

    adjustSvgSize();

    main_svg.call(timeline_vis.duration(instance._getAnimationStepDuration())
      .tl_layout(this.value)
      .height(globals.height)
      .width(globals.width));

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SELECT REPRESENTATION
  ---------------------------------------------------------------------------------------
  **/

  selectAllWithParent("#representation_picker input[name=representation_rb]").on("change", function () {
    instance.clearCanvas();

    //logEvent("representation change: " + this.value, "representation_change");

    if (timeline_vis.tl_layout() === "Segmented") {
      if (this.value === "Grid") {
        globals.segment_granularity = "centuries";
      } else if (this.value === "Calendar") {
        globals.segment_granularity = "weeks";
      } else {
        globals.segment_granularity = getSegmentGranularity(globals.global_min_start_date, globals.global_max_end_date);
      }
    }

    determineSize(globals.active_data, timeline_vis.tl_scale(), timeline_vis.tl_layout(), this.value);

    adjustSvgSize();

    main_svg.call(timeline_vis.duration(instance._getAnimationStepDuration())
      .tl_representation(this.value)
      .height(globals.height)
      .width(globals.width));

    if (timeline_vis.tl_representation() === "Curve" && !globals.dirty_curve) {
      selectWithParent(".timeline_frame").style("cursor", "crosshair");
    } else {
      selectWithParent(".timeline_frame").style("cursor", "auto");
    }

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SCENE transitions
  ---------------------------------------------------------------------------------------
  **/

  function updateNavigationStepper() {
    var STEPPER_STEP_WIDTH = 50;

    var navigation_step_svg = selectWithParent("#stepper_svg");

    var navigation_step = navigation_step_svg.selectAll(".framePoint")
      .data(globals.scenes);

    navigation_step.exit().transition()
      .delay(1000)
      .remove();

    var navigation_step_update = navigation_step.transition()
      .duration(instance.options.animations ? 1000 : 0);

    var navigation_step_enter = navigation_step.enter()
      .append("g")
      .attr("class", "framePoint")
      .attr("id", function (d) {
        return "frame" + d.s_order;
      })
      .attr("transform", function (d) {
        return "translate(" + (d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5) + ",0)";
      })
      .style("cursor", "pointer");

    navigation_step_update.attr("transform", function (d) {
      return "translate(" + (d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5) + ",0)";
    })
      .attr("id", function (d) {
        return "frame" + d.s_order;
      });

    navigation_step_enter.append("title")
      .text(function (d) {
        return "Scene " + (d.s_order + 1);
      });

    navigation_step_update.select("title")
      .text(function (d) {
        return "Scene " + (d.s_order + 1);
      });

    function changeSceneClickHandler(d) {
      instance._currentSceneIndex = d.s_order;
      changeScene(instance._currentSceneIndex);
    }

    navigation_step_enter.append("rect")
      .attr("fill", "white")
      .attr("width", STEPPER_STEP_WIDTH)
      .attr("height", STEPPER_STEP_WIDTH)
      .style("stroke", function (d) {
        return d.s_order === instance._currentSceneIndex ? "#f00" : "#ccc";
      })
      .style("stroke-width", "3px")
      .on("click", changeSceneClickHandler);

    navigation_step_update.select("rect")
      .style("stroke", function (d) {
        return d.s_order === instance._currentSceneIndex ? "#f00" : "#ccc";
      });

    if (isIE11) {
      navigation_step_enter.append("svg:text")
        .attr("x", 25)
        .attr("y", 25)
        .attr("font-size", "20px")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "central")
        .attr("style", "cursor:pointer")
        .text(function (d) {
          return (d.s_order + 1);
        })
        .on("click", changeSceneClickHandler);

      navigation_step_update.select("text")
        .text(function (d) {
          return (d.s_order + 1);
        });
    } else {
      navigation_step_enter.append("svg:image")
        .attr("xlink:href", function (d) {
          return d.s_src;
        })
        .attr("x", 2)
        .attr("y", 2)
        .attr("width", STEPPER_STEP_WIDTH - 4)
        .attr("height", STEPPER_STEP_WIDTH - 4)
        .on("click", changeSceneClickHandler);
    }

    var navigation_step_delete = navigation_step_enter.append("g")
      .attr("class", "scene_delete")
      .style("opacity", 0);

    navigation_step_delete.append("svg:image")
      .attr("class", "annotation_control annotation_delete")

      .attr("title", "Delete Scene")
      .attr("x", STEPPER_STEP_WIDTH - 17)
      .attr("y", 2)
      .attr("width", 15)
      .attr("height", 15)
      .attr("xlink:href", imageUrls("delete.png"));

    navigation_step_delete.append("rect")
      .attr("title", "Delete Scene")
      .attr("x", STEPPER_STEP_WIDTH - 17)
      .attr("y", 2)
      .attr("width", 15)
      .attr("height", 15)
      .on("mouseover", function () {
        d3.select(this).style("stroke", "#f00");
      })
      .on("mouseout", function () {
        d3.select(this).style("stroke", "#ccc");
      })
      .on("click", function (d) {
        selectWithParent("#frame" + d.s_order).remove();
        selectAllWithParent(".frame_hover").remove();
        // delete current scene unless image or caption div is open
        //logEvent("scene " + (d.s_order + 1) + " deleted.", "deletion");

        var j;
        for (j = 0; j < globals.scenes.length; j++) {
          if (globals.scenes[j].s_order === d.s_order) {
            globals.scenes.splice(j, 1);
          }
        }

        for (j = 0; j < globals.scenes.length; j++) {
          if (globals.scenes[j].s_order > d.s_order) {
            globals.scenes[j].s_order--;
          }
        }

        if (instance._currentSceneIndex > d.s_order) {
          instance._currentSceneIndex--;
        }

        updateNavigationStepper();

        instance._dispatch.stateChanged();

        if (instance._currentSceneIndex === d.s_order) { // is current scene to be deleted?
          if (instance._currentSceneIndex === globals.scenes.length - 1) { // is it the final scene?
            instance._currentSceneIndex = 0; // set current scene to first scene
          } else { // current scene is not the last scene
            instance._currentSceneIndex--; // set current scene to previous scene
            if (instance._currentSceneIndex < 0) { // did you delete the first scene?
              instance._currentSceneIndex = globals.scenes.length - 1; // set current to last scene
            }
          }

          if (globals.scenes.length === 0) { // are there no more scenes left?
            instance._currentSceneIndex = -1; // set current scene to -1
          } else {
            changeScene(instance._currentSceneIndex);
          }
        }
      })
      .append("title")
      .text("Delete Scene");

    if (!isIE11) {
      navigation_step_svg.selectAll(".framePoint")
        .on("mouseover", function () {
          const popupSize = 300;
          const frameRect = this.getBoundingClientRect();
          const relativeParentRect = selectWithParent(".timeline_storyteller-container").node().getBoundingClientRect();
          const offscreenAmount = (frameRect.right + popupSize) - relativeParentRect.right;

          // If we're offscreen, then adjust the position to take the offsceen amount into account
          const x_pos = frameRect.left - relativeParentRect.left - (offscreenAmount > 0 ? offscreenAmount : 0);
          const y_pos = frameRect.top - relativeParentRect.top;

          var img_src = d3.select(this).select("image").attr("href");

          d3.select(this).select("rect")
            .style("stroke", "#666");

          d3.select(this).select(".scene_delete")
            .style("opacity", 1);

          selectWithParent().append("div")
            .attr("class", "frame_hover")
            .style("left", `${x_pos}px`)
            .style("top", `${y_pos - popupSize - 20}px`)
            .append("svg")
            .style("padding", "0px")
            .style("width", `${popupSize}px`)
            .style("height", `${popupSize}px`)
            .append("svg:image")
            .attr("xlink:href", img_src)
            .attr("x", 2)
            .attr("y", 2)
            .attr("width", 296)
            .attr("height", 296);
        })
        .on("mouseout", function (d) {
          d3.select(this).select(".scene_delete")
            .style("opacity", 0);

          if (d.s_order === instance._currentSceneIndex) {
            d3.select(this).select("rect")
              .style("stroke", function () {
                return "#f00";
              });
          } else {
            d3.select(this).select("rect")
              .style("stroke", function () {
                return "#ccc";
              });
          }

          selectAllWithParent(".frame_hover").remove();
        });
    }

    navigation_step_svg.attr("width", (globals.scenes.length + 1) * (STEPPER_STEP_WIDTH + 5));

    const total = (globals.scenes || []).length;
    const sceneIdx = instance._currentSceneIndex;
    selectWithParent("#prev_scene_btn")
      // Always show 1 if at the beginning
      .attr("title", total > 1 ? `Scene ${sceneIdx === 0 ? total : sceneIdx} of ${total}` : "Previous Scene")
      .classed("img_btn_disabled", total < 2)
      .classed("img_btn_enabled", total > 1);

    selectWithParent("#next_scene_btn")
      .attr("title", total > 1 ? `Scene ${sceneIdx === total - 1 ? 1 : sceneIdx + 2} of ${total}` : "Next Scene")
      .classed("img_btn_disabled", total < 2)
      .classed("img_btn_enabled", total > 1);
  }

  instance._updateNavigationStepper = updateNavigationStepper;

  instance._prevTransitioning = false;
  function changeScene(scene_index) {
    // Assume we are waiting for transitions if there is already one going.
    var waitForTransitions = instance._prevTransitioning;

    updateNavigationStepper();

    var scene_found = false,
      i = 0,
      scene = globals.scenes[0];

    while (!scene_found && i < globals.scenes.length) {
      if (globals.scenes[i].s_order === scene_index) {
        scene_found = true;
        scene = globals.scenes[i];
      }
      i++;
    }

    selectWithParent("#timecurve").style("visibility", "hidden");

    if (scene.s_representation === "Curve") {
      selectWithParent("#timecurve").attr("d", globals.scenes[scene_index].s_timecurve);
      timeline_vis.render_path(globals.scenes[scene_index].s_timecurve);
      timeline_vis.reproduceCurve();
    }

    // is the new scene a segmented grid or calendar? if so, re-segment the events
    if (scene.s_layout === "Segmented") {
      if (scene.s_representation === "Grid") {
        globals.segment_granularity = "centuries";
      } else if (scene.s_representation === "Calendar") {
        globals.segment_granularity = "weeks";
      } else {
        globals.segment_granularity = getSegmentGranularity(globals.global_min_start_date, globals.global_max_end_date);
      }
    }

    // set a delay for annotations and captions based on whether the scale, layout, or representation changes
    if (timeline_vis.tl_scale() !== scene.s_scale || timeline_vis.tl_layout() !== scene.s_layout || timeline_vis.tl_representation() !== scene.s_representation) {
      waitForTransitions = true;
      instance._prevTransitioning = true;

      // how big is the new scene?
      determineSize(globals.active_data, scene.s_scale, scene.s_layout, scene.s_representation);

      // resize the main svg to accommodate the scene
      adjustSvgSize();

      // set the scene's scale, layout, representation
      timeline_vis.tl_scale(scene.s_scale)
        .tl_layout(scene.s_layout)
        .tl_representation(scene.s_representation)

        // Uses EFFECTIVE_HEIGHT
        .height(d3.max([globals.height, scene.s_height, (instance._render_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth())]))
        .width(d3.max([globals.width, scene.s_width]));
    }

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

    // initilaize scene filter settings
    var scene_category_values = [],
      scene_facet_values = [],
      scene_segment_values = [];

    // which categories are shown in the scene?
    scene.s_categories[0].forEach(function (item) {
      scene_category_values.push(item.__data__);
    });

    // update the category picker
    selectWithParent("#category_picker")
      .selectAll("option")
      .property("selected", function (d) {
        return scene_category_values.indexOf(d) !== -1;
      });

    // which facets are shown in the scene?
    scene.s_facets[0].forEach(function (item) {
      scene_facet_values.push(item.__data__);
    });

    // update the facet picker
    selectWithParent("#facet_picker")
      .selectAll("option")
      .property("selected", function (d) {
        return scene_facet_values.indexOf(d) !== -1;
      });

    // which segments are shown in the scene?
    scene.s_segments[0].forEach(function (item) {
      scene_segment_values.push(item.__data__);
    });

    // update the segment picker
    selectWithParent("#segment_picker")
      .selectAll("option")
      .property("selected", function (d) {
        return scene_segment_values.indexOf(d) !== -1;
      });

    // if filters change in "remove" mode, delay annoations and captions until after transition
    var scene_filter_set_length = scene_category_values.length + scene_facet_values.length + scene_segment_values.length;

    if (scene.s_filter_type === "Hide") {
      scene_filter_set_length += 1;
    }

    if (scene_filter_set_length !== globals.filter_set_length) {
      globals.filter_set_length = scene_filter_set_length;
      waitForTransitions = true;
      instance._prevTransitioning = true;
    }

    globals.selected_categories = scene.s_categories;
    globals.selected_facets = scene.s_facets;
    globals.selected_segments = scene.s_segments;

    // what type of filtering is used in the scene?
    if (scene.s_filter_type === "Hide") {
      selectAllWithParent("#filter_type_picker input[name=filter_type_rb]")
        .property("checked", function (d) {
          return d === "Hide";
        });
      if (globals.filter_type === "Emphasize") {
        globals.dispatch.Emphasize(selectWithParent("#category_picker").select("option"), selectWithParent("#facet_picker").select("option"), selectWithParent("#segment_picker").select("option"));
      }
      globals.filter_type = "Hide";
      globals.dispatch.remove(globals.selected_categories, globals.selected_facets, globals.selected_segments);
    } else if (scene.s_filter_type === "Emphasize") {
      selectAllWithParent("#filter_type_picker input[name=filter_type_rb]")
        .property("checked", function (d) {
          return d === "Emphasize";
        });
      if (globals.filter_type === "Hide") {
        globals.active_data = globals.all_data;
        globals.dispatch.remove(selectWithParent("#category_picker").select("option"), selectWithParent("#facet_picker").select("option"), selectWithParent("#segment_picker").select("option"));
      }
      globals.filter_type = "Emphasize";
      globals.dispatch.Emphasize(globals.selected_categories, globals.selected_facets, globals.selected_segments);
    }

    // where is the legend in the scene?
    selectWithParent(".legend")
      .transition()
      .duration(instance._getAnimationStepDuration())
      .style("z-index", 1)
      .attr("x", scene.s_legend_x)
      .attr("y", scene.s_legend_y);

    globals.legend_x = scene.s_legend_x;
    globals.legend_y = scene.s_legend_y;

    main_svg.selectAll(".timeline_caption").remove();

    main_svg.selectAll(".timeline_image").remove();

    main_svg.selectAll(".event_annotation").remove();

    selectAllWithParent(".timeline_event_g").each(function () {
      this.__data__.selected = false;
    });

    selectAllWithParent(".event_span")
      .attr("filter", "none")
      .style("stroke", "#fff")
      .style("stroke-width", "0.25px");

    selectAllWithParent(".event_span_component")
      .style("stroke", "#fff")
      .style("stroke-width", "0.25px");

    // delay the appearance of captions and annotations if the scale, layout, or representation changes relative to the previous scene
    if (waitForTransitions && timeline_vis.renderComplete) {
      //log("Waiting for transitions");
      timeline_vis.renderComplete.then(() => instance._loadAnnotations(scene, scene_index));
    } else {
      instance._loadAnnotations(scene, scene_index);
    }
  }

  instance._changeScene = changeScene;

  function measureTimeline(data) {
    /**
    ---------------------------------------------------------------------------------------
    SORT AND NEST THE EVENTS
    ---------------------------------------------------------------------------------------
    **/

    // event sorting function
    data.sort(compareAscending);

    if (globals.date_granularity === "epochs") {
      data.min_start_date = globals.earliest_date;
      data.max_start_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
      data.max_end_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
    } else {
      // determine the time domain of the data along a linear quantitative scale
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return time.minute.floor(d.end_date);
      });
    }

    if (globals.date_granularity === "epochs") {
      var format = function (d) {
        return globals.formatAbbreviation(d);
      };
      globals.range_text = format(data.max_end_date.valueOf() - data.min_start_date.valueOf()) + " years" +
        ": " + data.min_start_date.valueOf() + " - " + data.max_end_date.valueOf();
    } else {
      globals.range_text = moment(data.min_start_date).from(moment(data.max_end_date), true) +
        ": " + moment(data.min_start_date).format("YYYY-MM-DD") + " - " + moment(data.max_end_date).format("YYYY-MM-DD");
    }

    //logEvent("range: " + globals.range_text, "preprocessing");

    // create a nested data structure to contain faceted data
    globals.timeline_facets = d3.nest()
      .key(function (d) {
        return d.facet;
      })
      .sortKeys(d3.ascending)
      .entries(data);

    // get event durations
    data.forEach(function (item) {
      if (globals.date_granularity === "days") {
        item.duration = d3.time.days(item.start_date, item.end_date).length;
      } else if (globals.date_granularity === "years") {
        item.duration = item.end_date.getUTCFullYear() - item.start_date.getUTCFullYear();
      } else if (globals.date_granularity === "epochs") {
        item.duration = item.end_date.valueOf() - item.start_date.valueOf();
      }
    });

    data.max_duration = d3.max(data, function (d) {
      return d.duration;
    });

    data.min_duration = d3.min(data, function (d) {
      return d.duration;
    });

    //logEvent("max event duration: " + data.max_duration + " " + globals.date_granularity, "preprocessing");

    //logEvent("min event duration: " + data.min_duration + " " + globals.date_granularity, "preprocessing");

    // determine the granularity of segments
    globals.segment_granularity = getSegmentGranularity(data.min_start_date, data.max_end_date);

    //logEvent("segment granularity: " + globals.segment_granularity, "preprocessing");

    var segment_list = getSegmentList(data.min_start_date, data.max_end_date);

    globals.segments.domain(segment_list.map(function (d) {
      return d;
    }));

    //logEvent("segments (" + globals.segments.domain().length + "): " + globals.segments.domain(), "preprocessing");

    globals.num_segments = globals.segments.domain().length;
    globals.num_segment_cols = Math.ceil(Math.sqrt(globals.num_segments));
    globals.num_segment_rows = Math.ceil(globals.num_segments / globals.num_segment_cols);
  }
  /**
   * Renders the timeline
   * @param {object[]} data The data to render
   * @returns {void}
   */
  function drawTimeline(data) {
    selectWithParent("#timeline_metadata").style("display", "none");
    selectWithParent("#timeline_metadata_contents").html("");
    instance.importPanel.hide();

    /**
    ---------------------------------------------------------------------------------------
    CALL STANDALONE TIMELINE VISUALIZATIONS
    ---------------------------------------------------------------------------------------
    **/

    control_panel.selectAll("input").attr("class", "img_btn_enabled");
    selectWithParent("#navigation_div").style("bottom", (instance.options.showAbout === false || instance.playback_mode) ? "20px" : "50px");
    selectWithParent("#filter_type_picker").selectAll("input").property("disabled", false);
    selectWithParent("#filter_type_picker").selectAll("img").attr("class", "img_btn_enabled");

    selectAllWithParent("#record_scene_btn, #play_scene_btn").selectAll("img")
      .attr("class", "img_btn_enabled");

    var hasScenes = globals.scenes && globals.scenes.length;
    if (hasScenes) {
      selectWithParent("#record_scene_btn").attr("class", "img_btn_disabled");
      timeline_vis.tl_scale(globals.scenes[0].s_scale)
        .tl_layout(globals.scenes[0].s_layout)
        .tl_representation(globals.scenes[0].s_representation);
    }

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

    determineSize(data, timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

    adjustSvgSize();

    globals.global_min_start_date = data.min_start_date;
    globals.global_max_end_date = data.max_end_date;

    main_svg.datum(data)
      .call(timeline_vis.duration(instance._getAnimationStepDuration()).height(globals.height).width(globals.width));

    // TODO: This should move into each of the chart renderers when we have some time
    instance._hideError();
    instance._main_svg.style("opacity", 1);

    if (hasScenes) {
      instance._currentSceneIndex = 0;
      changeScene(0);
    }

    if (globals.legend_panel) {
      globals.legend_panel.remove();
      globals.legend_panel = undefined;
    }

    if (globals.num_categories <= 12 && globals.num_categories > 1) {
      // setup legend
      globals.legend_panel = main_svg.append("svg")
        .attr("height", 35 + globals.track_height * (globals.num_categories + 1) + 5)
        .attr("width", globals.max_legend_item_width + 10 + globals.unit_width + 10 + 20)
        .attr("y", 100)
        .attr("id", "legend_panel")
        .attr("class", "legend")
        .on("mouseover", function () {
          // if (selectAllWithParent("foreignObject")[0].length === 0) {
          //   addLegendColorPicker();
          // }
          d3.select(this).select(".legend_rect").attr("filter", "url(#drop-shadow)");
          d3.select(this).select("#legend_expand_btn").style("opacity", 1);
        })
        .on("mouseout", function () {
          d3.select(this).select(".legend_rect").attr("filter", "none");
          d3.select(this).select("#legend_expand_btn").style("opacity", 0.1);
        })
        .call(legendDrag);

      globals.legend_panel.append("rect")
        .attr("class", "legend_rect")
        .attr("height", globals.track_height * (globals.num_categories + 1))
        .attr("width", globals.max_legend_item_width + 5 + globals.unit_width + 10)
        .append("title")
        .text("Click on a color swatch to select a custom color for that category.");

      globals.legend_panel.append("svg:image")
        .attr("id", "legend_expand_btn")
        .attr("x", globals.max_legend_item_width + 5 + globals.unit_width - 10)
        .attr("y", 0)
        .attr("width", 20)
        .attr("height", 20)
        .attr("xlink:href", imageUrls("min.png"))
        .style("cursor", "pointer")
        .style("opacity", 0.1)
        .on("click", function () {
          if (globals.legend_expanded) {
            instance.collapseLegend();
          } else {
            instance.expandLegend();
          }
        })
        .append("title")
        .text("Expand / collapse legend.");

      var legendElementContainer = globals.legend_panel.selectAll(".legend_element_g").data(globals.categories.domain().sort());
      globals.legend = legendElementContainer
        .enter()
        .append("g")
        .attr("class", "legend_element_g");

      // Remove the element when not data bound.
      legendElementContainer.exit().remove();

      globals.legend.append("title")
        .text(function (d) {
          return d;
        });

      globals.legend.attr("transform", function (d, i) {
        return ("translate(0," + (35 + (i + 1) * globals.track_height) + ")");
      });

      globals.legend.on("mouseover", function (d) {
        var hovered_legend_element = d;

        //logEvent("legend hover: " + hovered_legend_element, "legend");

        d3.select(this).select("rect").style("stroke", "#f00");
        d3.select(this).select("text").style("font-weight", "bolder")
          .style("fill", "#f00");
        selectAllWithParent(".timeline_event_g").each(function (d) { // eslint-disable-line no-shadow
          if (d.category === hovered_legend_element || d.selected) {
            d3.select(this).selectAll(".event_span")
              .style("stroke", "#f00")
              .style("stroke-width", "1.25px")
              .attr("filter", "url(#drop-shadow)");
            d3.select(this).selectAll(".event_span_component")
              .style("stroke", "#f00")
              .style("stroke-width", "1px");
          } else {
            d3.select(this).selectAll(".event_span")
              .attr("filter", "url(#greyscale)");
            d3.select(this).selectAll(".event_span_component")
              .attr("filter", "url(#greyscale)");
          }
        });
      });

      globals.legend.on("mouseout", function (d) {
        d3.select(this).select("rect").style("stroke", "#fff");
        d3.select(this).select("text").style("font-weight", "normal")
          .style("fill", "#666");
        selectAllWithParent(".timeline_event_g").each(function () {
          d3.select(this).selectAll(".event_span")
            .style("stroke", "#fff")
            .style("stroke-width", "0.25px")
            .attr("filter", "none");
          d3.select(this).selectAll(".event_span_component")
            .style("stroke", "#fff")
            .style("stroke-width", "0.25px")
            .attr("filter", "none");
          if (d.selected) {
            d3.select(this)
              .selectAll(".event_span")
              .attr("filter", "url(#drop-shadow)")
              .style("stroke", "#f00")
              .style("stroke-width", "1.25px");
            d3.select(this)
              .selectAll(".event_span_component")
              .style("stroke", "#f00")
              .style("stroke-width", "1px");
          }
        });
      });

      globals.legend.append("rect")
        .attr("class", "legend_element")
        .attr("x", globals.legend_spacing)
        .attr("y", 2)
        .attr("width", globals.legend_rect_size)
        .attr("height", globals.legend_rect_size)
        .attr("transform", "translate(0,-35)")
        .style("fill", globals.categories)
        .on("click", function (d, i) {
          var colorEle = this;
          instance._colorPicker.show(this, globals.categories(d), function (value) {
            // Update the display
            selectWithParent(".legend").selectAll(".legend_element_g rect").each(function () {
              if (this.__data__ === d) {
                d3.select(colorEle).style("fill", value);
              }
            });

            instance.setCategoryColor(d, i, value);

            if (main_svg && timeline_vis) {
              main_svg.call(timeline_vis.duration(instance._getAnimationStepDuration()));
            }
          });
        })
        .append("title");

      globals.legend.append("text")
        .attr("class", "legend_element")
        .attr("x", globals.legend_rect_size + 2 * globals.legend_spacing)
        .attr("y", globals.legend_rect_size - globals.legend_spacing)
        .attr("dy", 3)
        .style("fill-opacity", "1")
        .style("display", "inline")
        .attr("transform", "translate(0,-35)")
        .text(function (d) {
          return d;
        });

      globals.legend_panel.append("text")
        .text("LEGEND")
        .attr("class", "legend_title")
        .attr("dy", "1.4em")
        .attr("dx", "0em")
        .attr("transform", "translate(5,0)rotate(0)");
    }

    return new Promise<void>(resolve => {
      if (timeline_vis.renderComplete) {
        timeline_vis.renderComplete.then(resolve);
      } else {
        resolve();
      }
    });
  }

  instance._drawTimeline = drawTimeline;

  /**

  --------------------------------------------------------------------------------------
  TIMELINE DATA PROCESSING UTILITY FUNCTIONS
  --------------------------------------------------------------------------------------
  **/

  function parseDates(data) {
    var i = 0;

    // parse the event dates
    // assign an end date if none is provided
    data.forEach(function (item) {
      item.event_id = i;
      globals.active_event_list.push(i);
      i++;

      // if there are numerical dates before -9999 or after 10000, don't attempt to parse them
      if (globals.date_granularity === "epochs") {
        return;
      }

      instance._parseStartAndEndDates(item);

      globals.active_event_list.push(item.event_id);
      globals.prev_active_event_list.push(item.event_id);
      globals.all_event_ids.push(item.event_id);
    });
  }

  // sort events according to start / end dates
  function compareAscending(item1, item2) {
    // Every item must have two fields: 'start_date' and 'end_date'.
    var result = item1.start_date - item2.start_date;

    // later first
    if (result < 0) {
      return -1;
    }
    if (result > 0) {
      return 1;
    }

    // shorter first
    result = item2.end_date - item1.end_date;
    if (result < 0) {
      return -1;
    }
    if (result > 0) {
      return 1;
    }

    // categorical tie-breaker
    if (item1.category < item2.category) {
      return -1;
    }
    if (item1.category > item2.category) {
      return 1;
    }

    // facet tie-breaker
    if (item1.facet < item2.facet) {
      return -1;
    }
    if (item1.facet > item2.facet) {
      return 1;
    }
    return 0;
  }

  // assign a track to each event item to prevent event overlap
  function assignTracks(data, tracks, layout) {
    // reset tracks first
    if (data && data.length) {
      data.forEach(function (item) {
        item.track = 0;
      });

      var i, track, min_width, effective_width;

      if (globals.date_granularity !== "epochs") {
        data.min_start_date = d3.min(data, function (d) {
          return d.start_date;
        });
        data.max_start_date = d3.max(data, function (d) {
          return d.start_date;
        });
        data.max_end_date = d3.max(data, function (d) {
          return d.end_date;
        });

        if (globals.width > (instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth())) {
          effective_width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
        } else {
          effective_width = globals.width;
        }


        var w = (effective_width - globals.padding.left - globals.padding.right - globals.unit_width),
          d = (data.max_end_date.getTime() - data.min_start_date.getTime());

        if (globals.segment_granularity === "days") {
          min_width = 0;
        } else if (layout === "Segmented") {
          min_width = 0;
        } else {
          min_width = (d / w * globals.unit_width);
        }
      }

      // older items end deeper
      data.forEach(function (item) {
        if (globals.date_granularity === "epochs") {
          item.track = 0;
        } else {
          for (i = 0, track = 0; i < tracks.length; i++, track++) {
            if (globals.segment_granularity === "days") {
              if (item.start_date.getTime() > tracks[i].getTime()) {
                break;
              }
            } else if (globals.segment_granularity === "weeks") {
              if (item.start_date.getTime() > tracks[i].getTime()) {
                break;
              }
            } else if (globals.segment_granularity === "months") {
              if (item.start_date.getTime() > tracks[i].getTime()) {
                break;
              }
            } else if (globals.segment_granularity === "years") {
              if (item.start_date.getTime() > tracks[i].getTime()) {
                break;
              }
            } else if (globals.segment_granularity === "decades" && globals.date_granularity === "days" && data.max_duration < 31) {
              if (item.start_date.getTime() > tracks[i].getTime()) {
                break;
              }
            } else if (globals.segment_granularity === "centuries" && globals.date_granularity === "days" && data.max_duration < 31) {
              if (item.start_date.getTime() > tracks[i].getTime()) {
                break;
              }
            } else if (globals.segment_granularity === "millenia") {
              if (item.start_date.getTime() > tracks[i].getTime()) {
                break;
              }
            } else if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          }
          item.track = track;

          if (min_width > item.end_date.getTime() - item.start_date.getTime()) {
            tracks[track] = moment(item.end_date.getTime() + min_width).toDate();
          } else {
            tracks[track] = item.end_date;
          }
        }
      });

      globals.num_tracks = d3.max(data, function (d) { // eslint-disable-line no-shadow
        return d.track;
      });
    } else {
      globals.num_tracks = 0;
    }
  }

  // assign a track to each event item to prevent event overlap
  function assignSequenceTracks(data) {
    var angle = 0,
      j = 0;

    // reset tracks and indices first, assign spiral coordinates
    data.forEach(function (item) {
      item.item_index = j;
      if (!globals.dirty_curve) {
        item.curve_x = (j * globals.spiral_padding) % (globals.width - globals.margin.left - globals.margin.right - globals.spiral_padding - globals.unit_width);
        item.curve_y = Math.floor((j * globals.spiral_padding) / (globals.width - globals.margin.left - globals.margin.right - globals.spiral_padding - globals.unit_width)) * globals.spiral_padding;
      }
      item.seq_track = 0;
      item.seq_index = 0;
      var radius = Math.sqrt(j + 1);
      angle += Math.asin(1 / radius);
      j++;
      item.spiral_index = j;
      item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
      item.spiral_y = Math.sin(angle) * (radius * globals.spiral_padding);
    });

    globals.max_item_index = d3.max(data, function (d) { return d.item_index; });

    var index = 0;
    if (globals.date_granularity !== "epochs") {
      globals.latest_start_date = data[0].start_date.getTime();
    }

    // older items end deeper
    data.forEach(function (item) {
      item.seq_index = index;
      item.seq_track = 0;
      index++;
    });

    globals.num_seq_tracks = d3.max(data, function (d) {
      return d.seq_track;
    });
  }

  // analyze each facet individually and assign within-facet tracks and relative start and end dates
  function processFacets() {
    globals.max_end_age = 0;
    globals.max_num_tracks = 0;
    globals.max_num_seq_tracks = 0;

    // calculate derived age measure for each event in each timeline
    globals.timeline_facets.forEach(function (timeline) {
      // determine maximum number of tracks for chronological and sequential scales
      assignTracks(timeline.values, [], "Faceted");
      assignSequenceTracks(timeline.values);
      timeline.values.num_tracks = d3.max(timeline.values, function (d) {
        return d.track;
      });
      timeline.values.num_seq_tracks = d3.max(timeline.values, function (d) {
        return d.seq_track;
      });

      if (timeline.values.num_tracks > globals.max_num_tracks) {
        globals.max_num_tracks = timeline.values.num_tracks + 1;
      }

      if (timeline.values.num_seq_tracks > globals.max_num_seq_tracks) {
        globals.max_num_seq_tracks = timeline.values.num_seq_tracks + 1;
      }

      timeline.values.min_start_date = d3.min(timeline.values, function (d) {
        return d.start_date;
      });

      var angle = 0;
      var i = 0;

      timeline.values.forEach(function (item) {
        // assign spiral coordinates
        var radius = Math.sqrt(i + 1);
        angle += Math.asin(1 / radius);
        i++;
        item.spiral_index = i;
        item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
        item.spiral_x = Math.sin(angle) * (radius * globals.spiral_padding);

        if (globals.date_granularity === "epochs") {
          item.start_age = item.start_date - timeline.values.min_start_date;
          item.start_age_label = "";
          item.end_age = item.end_date - timeline.values.min_start_date;
          item.end_age_label = "";
        } else {
          item.start_age = item.start_date - timeline.values.min_start_date;
          item.start_age_label = moment(timeline.values.min_start_date).from(moment(item.start_date), true);
          item.end_age = item.end_date - timeline.values.min_start_date;
          item.end_age_label = moment(timeline.values.min_start_date).from(moment(item.end_date), true);
        }
      });
      timeline.values.max_end_age = d3.max(timeline.values, function (d) {
        return d.end_age;
      });

      if (timeline.values.max_end_age > globals.max_end_age) {
        globals.max_end_age = timeline.values.max_end_age;
      }
    });
  }

  function getSegmentGranularity(min_date, max_date) {
    if (min_date === undefined || max_date === undefined) {
      return "";
    }

    var timeline_range,  // limit the number of facets to less than 20, rounding up / down to nearest natural temporal boundary
      days_to_years; // flag for transitioning to granularities of years or longer

    if (globals.date_granularity === "days") {
      timeline_range = time.day.count(time.day.floor(min_date), time.day.floor(max_date));

      if (timeline_range <= 7) {
        return "days";
      } else if (timeline_range > 7 && timeline_range <= 42) {
        return "weeks";
      } else if (timeline_range > 42 && timeline_range <= 732) {
        return "months";
      }
      days_to_years = true;
    }
    if (globals.date_granularity === "years" || days_to_years) {
      timeline_range = max_date.getUTCFullYear() - min_date.getUTCFullYear();

      if (timeline_range <= 10) {
        return "years";
      } else if (timeline_range > 10 && timeline_range <= 100) {
        return "decades";
      } else if (timeline_range > 100 && timeline_range <= 1000) {
        return "centuries";
      }
      return "millenia";
    } else if (globals.date_granularity === "epochs") {
      return "epochs";
    }
  }

  function getSegment(item) {
    var segment = "";

    switch (globals.segment_granularity) {
      case "days":
        segment = moment(item.end_date).format("MMM Do");
        break;
      case "weeks":
        segment = moment(item).format("WW / YY");
        break;
      case "months":
        segment = moment(item).format("MM-YY (MMM)");
        break;
      case "years":
        segment = moment(item).format("YYYY");
        break;
      case "decades":
        segment = (Math.floor(item.getUTCFullYear() / 10) * 10).toString() + "s";
        break;
      case "centuries":
        segment = (Math.floor(item.getUTCFullYear() / 100) * 100).toString() + "s";
        break;
      case "millenia":
        segment = (Math.floor(item.getUTCFullYear() / 1000) * 1000).toString() + " - " + (Math.ceil((item.getUTCFullYear() + 1) / 1000) * 1000).toString();
        break;
      case "epochs":
      default:
        segment = "";
        break;
    }
    return segment;
  }

  function getSegmentList(start_date, end_date) {
    var segments_domain = [];
    switch (globals.segment_granularity) {

      case "days":
        var day_array = d3.time.days(start_date, end_date);
        day_array.forEach(function (d) {
          segments_domain.push(getSegment(d));
        });
        break;

      case "weeks":
        var week_array = d3.time.weeks(d3.time.week.floor(start_date), d3.time.week.ceil(end_date));
        week_array.forEach(function (d) {
          segments_domain.push(getSegment(d));
        });
        break;

      case "months":
        var month_array = d3.time.months(d3.time.month.floor(start_date), d3.time.month.ceil(end_date));
        month_array.forEach(function (d) {
          segments_domain.push(getSegment(d));
        });
        break;

      case "years":
        var year_array = d3.time.years(d3.time.year.floor(start_date), d3.time.year.ceil(end_date));
        year_array.forEach(function (d) {
          segments_domain.push(getSegment(d));
        });
        break;

      case "decades":
        var min_decade_start_date = d3.time.year.floor(start_date);
        var min_decade_offset = start_date.getUTCFullYear() % 10;
        if (min_decade_offset < 0) {
          min_decade_offset += 10;
        }
        min_decade_start_date.setUTCFullYear(start_date.getUTCFullYear() - min_decade_offset);
        var decade_array = d3.time.years(d3.time.year.floor(min_decade_start_date), d3.time.year.ceil(end_date), 10);
        decade_array.forEach(function (d) {
          segments_domain.push(getSegment(d));
        });
        break;

      case "centuries":
        var min_century_start_date = d3.time.year.floor(start_date);
        var min_century_offset = start_date.getUTCFullYear() % 100;
        if (min_century_offset < 0) {
          min_century_offset += 100;
        }
        min_century_start_date.setUTCFullYear(start_date.getUTCFullYear() - min_century_offset);
        var century_array = d3.time.years(d3.time.year.floor(min_century_start_date), d3.time.year.ceil(end_date), 100);
        century_array.forEach(function (d) {
          segments_domain.push(getSegment(d));
        });
        break;

      case "millenia":
        var min_millenia_start_date = d3.time.year.floor(start_date);
        var min_millenia_offset = start_date.getUTCFullYear() % 1000;
        if (min_millenia_offset < 0) {
          min_millenia_offset += 1000;
        }
        min_millenia_start_date.setUTCFullYear(start_date.getUTCFullYear() - min_millenia_offset);
        var millenia_array = d3.time.years(d3.time.year.floor(min_millenia_start_date), d3.time.year.ceil(end_date), 1000);
        millenia_array.forEach(function (d) {
          segments_domain.push(getSegment(d));
        });
        break;

      case "epochs":
        segments_domain = [""];
        break;
      default:
        break;
    }
    return segments_domain;
  }

  // resizes the timeline container based on combination of scale, layout, representation
  function determineSize(data, scale, layout, representation) {
    //logEvent("timeline: " + scale + " - " + layout + " - " + representation, "sizing");

    switch (representation) {

      case "Linear":
        switch (scale) {

          case "Chronological":
            switch (layout) {

              case "Unified":
                // justifiable
                assignTracks(data, [], layout);
                //logEvent("# tracks: " + globals.num_tracks, "sizing");

                globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
                globals.height = globals.num_tracks * globals.track_height + 1.5 * globals.track_height + globals.margin.top + globals.margin.bottom;
                break;

              case "Faceted":
                // justifiable
                processFacets();
                //logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

                globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
                globals.height = (globals.max_num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
                break;

              case "Segmented":
                // justifiable
                assignTracks(data, [], layout);
                //logEvent("# tracks: " + globals.num_tracks, "sizing");

                globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
                globals.height = (globals.num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_segments + globals.margin.top + globals.margin.bottom;
                break;
              default:
                break;
            }
            break;

          case "Relative":
            if (layout === "Faceted") {
              // justifiable
              processFacets();
              //logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

              globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
              globals.height = (globals.max_num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
            } else {
              // not justifiable
              //logEvent("scale-layout-representation combination not possible/justifiable", "error");

              globals.width = 0;
              globals.height = 0;
            }
            break;

          case "Log":
            if (layout === "Unified") {
              // justifiable
              assignTracks(data, [], layout);
              //logEvent("# tracks: " + globals.num_tracks, "sizing");

              globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
              globals.height = globals.num_tracks * globals.track_height + 1.5 * globals.track_height + globals.margin.top + globals.margin.bottom;
            } else if (layout === "Faceted") {
              // justifiable
              processFacets();
              //logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

              globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
              globals.height = (globals.max_num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
            } else {
              // not justifiable
              //logEvent("scale-layout-representation combination not possible/justifiable", "error");

              globals.width = 0;
              globals.height = 0;
            }
            break;

          case "Collapsed":
            if (layout === "Unified") {
              // justifiable
              assignSequenceTracks(data);
              globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
              var bar_chart_height = (4 * globals.unit_width);
              globals.width = globals.max_seq_index * 1.5 * globals.unit_width + globals.margin.left + 3 * globals.margin.right;
              globals.height = (globals.num_seq_tracks * globals.track_height + 1.5 * globals.track_height) + bar_chart_height + globals.margin.top + globals.margin.bottom;
            } else {
              // not justifiable
              //logEvent("scale-layout-representation combination not possible/justifiable", "error");

              globals.width = 0;
              globals.height = 0;
            }
            break;

          case "Sequential":
            if (layout === "Unified") {
              // justifiable
              assignSequenceTracks(data);
              globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
              globals.width = d3.max([
                globals.max_seq_index * 1.5 * globals.unit_width + globals.margin.left + globals.margin.right,
                instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
              ]);
              globals.height = globals.num_seq_tracks * globals.track_height + 1.5 * globals.track_height + globals.margin.top + globals.margin.bottom;
            } else if (layout === "Faceted") {
              // justifiable
              processFacets();
              globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
              globals.width = d3.max([
                globals.max_seq_index * 1.5 * globals.unit_width + globals.margin.left + globals.margin.right,
                instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
              ]);
              globals.height = (globals.max_num_seq_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
            } else {
              // not justifiable
              //logEvent("scale-layout-representation combination not possible/justifiable", "error");

              globals.width = 0;
              globals.height = 0;
            }
            break;
          default:
            break;
        }
        break;

      case "Radial":

        globals.centre_radius = 50;

        var effective_size = instance._render_width - globals.margin.right - globals.padding.right - globals.margin.left - globals.padding.left - getScrollbarWidth();

        switch (scale) {

          case "Chronological":

            switch (layout) {

              case "Unified":
                // justifiable
                assignTracks(data, [], layout);
                //logEvent("# tracks: " + globals.num_tracks, "sizing");

                globals.centre_radius = d3.max([50, (effective_size - ((globals.num_tracks + 2) * 2 * globals.track_height)) / 2]);
                globals.width = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) + globals.margin.left + globals.margin.right;
                if (globals.centre_radius > 200) { globals.centre_radius = 200; }
                globals.height = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) + globals.margin.top + globals.margin.bottom;
                break;

              case "Faceted":
                // justifiable
                processFacets();

                globals.centre_radius = 50;
                var estimated_facet_width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height);

                globals.num_facet_cols = d3.max([1, d3.min([globals.num_facet_cols, Math.floor(effective_size / estimated_facet_width)])]);
                globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

                globals.centre_radius = d3.max([50, (effective_size / globals.num_facet_cols - ((globals.max_num_tracks + 2) * 2 * globals.track_height)) / 2]);
                globals.width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_cols + globals.margin.left + globals.margin.right;
                if (globals.centre_radius > 200) { globals.centre_radius = 200; }
                globals.height = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_rows + globals.margin.top + globals.margin.bottom + globals.num_facet_rows * globals.buffer;
                break;

              case "Segmented":
                // justifiable
                assignTracks(data, [], layout);
                //logEvent("# tracks: " + globals.num_tracks, "sizing");

                globals.centre_radius = 50;
                var estimated_segment_width = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height);

                globals.num_segment_cols = d3.max([1, d3.min([globals.num_segment_cols, Math.floor(effective_size / estimated_segment_width)])]);
                globals.num_segment_rows = Math.ceil(globals.num_segments / globals.num_segment_cols);

                globals.centre_radius = d3.max([50, (effective_size / globals.num_segment_cols - ((globals.num_tracks + 2) * 2 * globals.track_height)) / 2]);
                globals.width = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) * globals.num_segment_cols + globals.margin.left + globals.margin.right;
                if (globals.centre_radius > 200) {
                  globals.centre_radius = 200;
                }
                globals.height = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) * globals.num_segment_rows + globals.margin.top + globals.margin.bottom + globals.num_segment_rows * globals.buffer;
                break;
              default:
                break;
            }
            break;

          case "Relative":
            if (layout === "Faceted") {
              // justifiable
              processFacets();
              //logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

              globals.centre_radius = 50;
              estimated_facet_width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height);

              globals.num_facet_cols = d3.min([globals.num_facet_cols, Math.floor(effective_size / estimated_facet_width)]);
              globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

              globals.centre_radius = d3.max([50, (effective_size / globals.num_facet_cols - ((globals.max_num_tracks + 2) * 2 * globals.track_height)) / 2]);
              globals.width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_cols + globals.margin.left + globals.margin.right;
              if (globals.centre_radius > 200) {
                globals.centre_radius = 200;
              }
              globals.height = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_rows + globals.margin.top + globals.margin.bottom + globals.num_facet_rows * globals.buffer;
            } else {
              // not justifiable
              //logEvent("scale-layout-representation combination not possible/justifiable", "error");

              globals.width = 0;
              globals.height = 0;
            }
            break;

          case "Sequential":
            if (layout === "Unified") {
              // justifiable
              assignSequenceTracks(data);
              globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
              globals.centre_radius = (effective_size - (4 * globals.track_height)) / 2;
              globals.width = (2 * globals.centre_radius + 4 * globals.track_height) + globals.margin.left + globals.margin.right;
              if (globals.centre_radius > 200) {
                globals.centre_radius = 200;
              }
              globals.height = (2 * globals.centre_radius + 4 * globals.track_height) + globals.margin.top + globals.margin.bottom;
            } else if (layout === "Faceted") {
              // justifiable

              processFacets();
              globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;

              globals.centre_radius = 50;
              estimated_facet_width = (2 * globals.centre_radius + (4 * globals.track_height));

              globals.num_facet_cols = d3.min([globals.num_facet_cols, Math.floor(effective_size / estimated_facet_width)]);
              globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

              globals.centre_radius = d3.max([50, (effective_size / globals.num_facet_cols - (4 * globals.track_height)) / 2]);
              globals.width = (2 * globals.centre_radius + 4 * globals.track_height) * globals.num_facet_cols + globals.margin.left + globals.margin.right;
              if (globals.centre_radius > 200) {
                globals.centre_radius = 200;
              }
              globals.height = (2 * globals.centre_radius + 4 * globals.track_height) * globals.num_facet_rows + globals.margin.top + globals.margin.bottom + globals.num_facet_rows * globals.buffer;
            } else {
              // not justifiable
              //logEvent("scale-layout-representation combination not possible/justifiable", "error");

              globals.width = 0;
              globals.height = 0;
            }
            break;
          default:
            break;
        }
        break;

      case "Grid":

        if (scale === "Chronological" && layout === "Segmented") {
          // justifiable

          assignTracks(data, [], layout);

          var cell_size = 50,
            century_height = cell_size * globals.unit_width,
            century_width = cell_size * 10;

          // determine the range, round to whole centuries
          var range_floor = Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100,
            range_ceil = Math.ceil((data.max_end_date.getUTCFullYear() + 1) / 100) * 100;

          // determine the time domain of the data along a linear quantitative scale
          var year_range = d3.range(range_floor, range_ceil);

          // determine maximum number of centuries given year_range
          var num_centuries = (Math.ceil(year_range.length / 100));

          globals.width = century_width + globals.margin.left + globals.margin.right;
          globals.height = num_centuries * century_height + num_centuries * cell_size + globals.margin.top + globals.margin.bottom - cell_size;
        } else {
          // not justifiable
          //logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;

      case "Calendar":

        if (scale === "Chronological" && layout === "Segmented") {
          // justifiable

          assignTracks(data, [], layout);

          cell_size = 20;
          var year_height = cell_size * 8, // 7 days of week + buffer
            year_width = cell_size * 53; // 53 weeks of the year + buffer

          // determine the range, round to whole centuries
          range_floor = data.min_start_date.getUTCFullYear();
          range_ceil = data.max_end_date.getUTCFullYear();

          // determine the time domain of the data along a linear quantitative scale
          year_range = d3.range(range_floor, range_ceil + 1);

          globals.width = year_width + globals.margin.left + globals.margin.right;
          globals.height = year_range.length * year_height + globals.margin.top + globals.margin.bottom - cell_size;
        } else {
          // not justifiable
          //logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;

      case "Spiral":

        if (scale === "Sequential") {
          if (layout === "Unified") {
            // justifiable

            assignSequenceTracks(data);
            globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
            var angle = 0,
              i = 0;

            data.forEach(function (item) {
              var radius = Math.sqrt(i + 1);
              angle += Math.asin(1 / radius);
              i++;
              item.spiral_index = i;
              item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
              item.spiral_y = Math.sin(angle) * (radius * globals.spiral_padding);
            });

            var max_x = d3.max(data, function (d) { return d.spiral_x; });
            var max_y = d3.max(data, function (d) { return d.spiral_y; });
            var min_x = d3.min(data, function (d) { return d.spiral_x; });
            var min_y = d3.min(data, function (d) { return d.spiral_y; });

            globals.spiral_dim = d3.max([(max_x + 2 * globals.spiral_padding) - (min_x - 2 * globals.spiral_padding), (max_y + 2 * globals.spiral_padding) - (min_y - 2 * globals.spiral_padding)]);

            globals.width = d3.max([
              globals.spiral_dim + globals.spiral_padding + globals.margin.right + globals.margin.left,
              instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
            ]);

            // USES EFFECTIVE_HEIGHT
            globals.height = d3.max([
              globals.spiral_dim + globals.spiral_padding + globals.margin.top + globals.margin.bottom,
              instance._render_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth()
            ]);
          } else if (layout === "Faceted") {
            // justifiable
            processFacets();
            globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;

            globals.timeline_facets.forEach(function (timeline) {
              angle = 0;
              i = 0;

              timeline.values.forEach(function (item) {
                var radius = Math.sqrt(i + 1);
                angle += Math.asin(1 / radius);
                i++;
                item.spiral_index = i;
                item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
                item.spiral_y = Math.sin(angle) * (radius * globals.spiral_padding);
              });
            });

            max_x = d3.max(data, function (d) { return d.spiral_x; });
            max_y = d3.max(data, function (d) { return d.spiral_y; });
            min_x = d3.min(data, function (d) { return d.spiral_x; });
            min_y = d3.min(data, function (d) { return d.spiral_y; });

            globals.spiral_dim = d3.max([(max_x + 2 * globals.spiral_padding) - (min_x - 2 * globals.spiral_padding), (max_y + 2 * globals.spiral_padding) - (min_y - 2 * globals.spiral_padding)]);

            effective_size = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();

            globals.num_facet_cols = d3.min([globals.num_facet_cols, Math.floor(effective_size / globals.spiral_dim)]);
            globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

            globals.width = d3.max([
              globals.num_facet_cols * globals.spiral_dim + globals.margin.right + globals.margin.left,
              instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
            ]);
            globals.height = globals.num_facet_rows * globals.spiral_dim + globals.margin.top + globals.margin.bottom;
          } else {
            // not justifiable
            globals.width = 0;
            globals.height = 0;
          }
        } else {
          // not justifiable
          //logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;

      case "Curve":
        if (scale === "Sequential" && layout === "Unified") {
          // justifiable
          assignSequenceTracks(data);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
          globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
          globals.height = instance._render_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth();
        } else {
          // not justifiable
          //logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;
      default:
        break;
    }
    //logEvent("dimensions: " + globals.width + " (W) x " + globals.height + " (H)", "sizing");
  }

  instance._determineSize = determineSize;

  function updateRadioBttns(scale, layout, representation) {
    // update the control radio buttons
    selectAllWithParent("#scale_picker input[name=scale_rb]").property("checked", function (d) {
      return d === scale;
    });
    selectAllWithParent("#layout_picker input[name=layout_rb]").property("checked", function (d) {
      return d === layout;
    });
    selectAllWithParent("#representation_picker input[name=representation_rb]").property("checked", function (d) {
      return d === representation;
    });

    selectAllWithParent("#scale_picker img")
      .style("border-bottom", function (d) {
        if (d.name === scale) { return "2px solid #f00"; }
      })
      .style("border-right", function (d) {
        if (d.name === scale) { return "2px solid #f00"; }
      });
    selectAllWithParent("#layout_picker img")
      .style("border-bottom", function (d) {
        if (d.name === layout) { return "2px solid #f00"; }
      })
      .style("border-right", function (d) {
        if (d.name === layout) { return "2px solid #f00"; }
      });
    selectAllWithParent("#representation_picker img")
      .style("border-bottom", function (d) {
        if (d.name === representation) { return "2px solid #f00"; }
      })
      .style("border-right", function (d) {
        if (d.name === representation) { return "2px solid #f00"; }
      });

    selectAllWithParent(".option_rb").select("input").property("disabled", function (d) {
      switch (d.name) {

        case "Chronological":
          return !(representation !== "Spiral" && representation !== "Curve");

        case "Relative":
          return !(layout === "Faceted" && (representation === "Linear" || representation === "Radial"));

        case "Log":
          return !(representation === "Linear" && layout !== "Segmented");

        case "Collapsed":
          return !(representation === "Linear" && layout === "Unified");

        case "Sequential":
          return !((representation !== "Grid" && representation !== "Calendar") && layout !== "Segmented");

        case "Unified":
          return !(scale !== "Relative" && representation !== "Grid" && representation !== "Calendar");

        case "Faceted":
          return !(scale !== "Collapsed" && representation !== "Grid" && representation !== "Calendar" && representation !== "Curve" && globals.total_num_facets > 1);

        case "Segmented":
          return !(scale === "Chronological" && representation !== "Spiral" && representation !== "Curve");

        case "Linear":
          return false;

        case "Calendar":
          return !(scale === "Chronological" && layout === "Segmented" && (["weeks", "months", "years", "decades"].indexOf(globals.segment_granularity) !== -1));

        case "Grid":
          return !(scale === "Chronological" && layout === "Segmented" && (["decades", "centuries", "millenia"].indexOf(globals.segment_granularity) !== -1));

        case "Radial":
          return !(scale !== "Log" && scale !== "Collapsed");

        case "Spiral":
          return !(scale === "Sequential" && (layout === "Unified" || layout === "Faceted"));

        case "Curve":
          return !(scale === "Sequential" && layout === "Unified");
        default:
          return;
      }
    });

    selectAllWithParent(".option_rb").select("img").attr("class", function (d) {
      switch (d.name) {
        case "Chronological":
          return (representation !== "Spiral" && representation !== "Curve") ? "img_btn_enabled" : "img_btn_disabled";
        case "Relative":
          return (layout === "Faceted" && (representation === "Linear" || representation === "Radial")) ? "img_btn_enabled" : "img_btn_disabled";
        case "Log":
          return (representation === "Linear" && layout !== "Segmented") ? "img_btn_enabled" : "img_btn_disabled";
        case "Collapsed":
          return (representation === "Linear" && layout === "Unified") ? "img_btn_enabled" : "img_btn_disabled";
        case "Sequential":
          return ((representation !== "Grid" && representation !== "Calendar") && layout !== "Segmented") ? "img_btn_enabled" : "img_btn_disabled";
        case "Unified":
          return (scale !== "Relative" && representation !== "Grid" && representation !== "Calendar") ? "img_btn_enabled" : "img_btn_disabled";
        case "Faceted":
          return (scale !== "Collapsed" && representation !== "Grid" && representation !== "Calendar" && representation !== "Curve" && globals.total_num_facets > 1) ? "img_btn_enabled" : "img_btn_disabled";
        case "Segmented":
          return (scale === "Chronological" && representation !== "Spiral" && representation !== "Curve") ? "img_btn_enabled" : "img_btn_disabled";
        case "Linear":
          return "img_btn_enabled";
        case "Calendar":
          return (scale === "Chronological" && layout === "Segmented" && (["weeks", "months", "years", "decades"].indexOf(globals.segment_granularity) !== -1)) ? "img_btn_enabled" : "img_btn_disabled";
        case "Grid":
          return (scale === "Chronological" && layout === "Segmented" && (["decades", "centuries", "millenia"].indexOf(globals.segment_granularity) !== -1)) ? "img_btn_enabled" : "img_btn_disabled";
        case "Radial":
          return (scale !== "Log" && scale !== "Collapsed") ? "img_btn_enabled" : "img_btn_disabled";
        case "Spiral":
          return (scale === "Sequential" && (layout === "Unified" || layout === "Faceted")) ? "img_btn_enabled" : "img_btn_disabled";
        case "Curve":
          return (scale === "Sequential" && layout === "Unified") ? "img_btn_enabled" : "img_btn_disabled";
        default:
          return;
      }
    });
  }

  // highlight matches and de-emphasize (grey-out) mismatches
  globals.dispatch.on("Emphasize", function (selected_categories, selected_facets, selected_segments) {
    var timeline_events = selectAllWithParent(".timeline_event_g");
    var matches, mismatches,
      selected_category_values = [],
      selected_facet_values = [],
      selected_segment_values = [];

    globals.prev_active_event_list = globals.active_event_list;

    globals.active_event_list = [];

    selected_categories[0].forEach(function (item) {
      selected_category_values.push(item.__data__);
    });

    selected_facets[0].forEach(function (item) {
      selected_facet_values.push(item.__data__);
    });

    selected_segments[0].forEach(function (item) {
      selected_segment_values.push(item.__data__);
    });

    mismatches = timeline_events.filter(function (d) {
      return (selected_category_values.indexOf("( All )") === -1 && selected_category_values.indexOf(d.category) === -1) ||
        (selected_facet_values.indexOf("( All )") === -1 && selected_facet_values.indexOf(d.facet) === -1) ||
        (selected_segment_values.indexOf("( All )") === -1 && selected_segment_values.indexOf(d.segment) === -1);
    });

    matches = timeline_events.filter(function (d) {
      return (selected_category_values.indexOf("( All )") !== -1 || selected_category_values.indexOf(d.category) !== -1) &&
        (selected_facet_values.indexOf("( All )") !== -1 || selected_facet_values.indexOf(d.facet) !== -1) &&
        (selected_segment_values.indexOf("( All )") !== -1 || selected_segment_values.indexOf(d.segment) !== -1);
    });

    // if (mismatches[0].length !== 0) {
    //   logEvent(matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events", "Emphasize");
    // } else {
    //   logEvent(matches[0].length + " events", "Emphasize");
    // }

    globals.all_data.forEach(function (item) {
      if ((selected_category_values.indexOf("( All )") !== -1 || selected_category_values.indexOf(item.category) !== -1) &&
        (selected_facet_values.indexOf("( All )") !== -1 || selected_facet_values.indexOf(item.facet) !== -1) &&
        (selected_segment_values.indexOf("( All )") !== -1 || selected_segment_values.indexOf(item.segment) !== -1)) {
        globals.active_event_list.push(item.event_id);
      }
    });

    main_svg.call(timeline_vis.duration(instance._getAnimationStepDuration()));

    globals.prev_active_event_list = globals.active_event_list;
  });

  // remove mismatches
  globals.dispatch.on("remove", function (selected_categories, selected_facets, selected_segments) {
    instance.clearCanvas();

    const active_event_list = [];

    var matches, mismatches,
      selected_category_values = [],
      selected_facet_values = [],
      selected_segment_values = [],
      reset_segmented_layout = false;

    selected_categories[0].forEach(function (item) {
      selected_category_values.push(item.__data__);
    });

    selected_facets[0].forEach(function (item) {
      selected_facet_values.push(item.__data__);
    });

    selected_segments[0].forEach(function (item) {
      selected_segment_values.push(item.__data__);
    });

    globals.all_data.forEach(function (item) {
      if ((selected_category_values.indexOf("( All )") !== -1 || selected_category_values.indexOf(item.category) !== -1) &&
        (selected_facet_values.indexOf("( All )") !== -1 || selected_facet_values.indexOf(item.facet) !== -1) &&
        (selected_segment_values.indexOf("( All )") !== -1 || selected_segment_values.indexOf(item.segment) !== -1)) {
        active_event_list.push(item.event_id);
      }
    });

    mismatches = selectAllWithParent(".timeline_event_g").filter(function (d) {
      return active_event_list.indexOf(d.event_id) === -1;
    });

    matches = selectAllWithParent(".timeline_event_g").filter(function (d) {
      return active_event_list.indexOf(d.event_id) !== -1;
    });

    const active_data = globals.all_data.filter(function (d) {
      return active_event_list.indexOf(d.event_id) !== -1;
    });

    // We only support having at least on item.
    if (active_data.length > 0) {
      globals.prev_active_event_list = globals.active_event_list;
      globals.active_event_list = active_event_list;
      globals.active_data = active_data;

      // if (mismatches[0].length !== 0) {
      //   logEvent(matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events", "remove");
      // } else {
      //   logEvent(matches[0].length + " events", "remove");
      // }

      measureTimeline(globals.active_data);

      globals.active_data.min_start_date = d3.min(globals.active_data, function (d) {
        return d.start_date;
      });
      globals.active_data.max_start_date = d3.max(globals.active_data, function (d) {
        return d.start_date;
      });
      globals.active_data.max_end_date = d3.max(globals.active_data, function (d) {
        return time.minute.floor(d.end_date);
      });

      globals.all_data.min_start_date = globals.active_data.min_start_date;
      globals.all_data.max_end_date = globals.active_data.max_end_date;

      globals.max_end_age = 0;

      // determine facets (separate timelines) from data
      globals.facets.domain(globals.active_data.map(function (d) {
        return d.facet;
      }));

      globals.facets.domain().sort();

      globals.num_facets = globals.facets.domain().length;
      globals.num_facet_cols = Math.ceil(Math.sqrt(globals.num_facets));
      globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

      //logEvent("num facets: " + globals.num_facet_cols, "remove");

      if (timeline_vis.tl_layout() === "Segmented") {
        if (timeline_vis.tl_representation() === "Grid") {
          globals.segment_granularity = "centuries";
        } else if (timeline_vis.tl_representation() === "Calendar") {
          globals.segment_granularity = "weeks";
        } else {
          globals.segment_granularity = getSegmentGranularity(globals.global_min_start_date, globals.global_max_end_date);
        }
      }

      var segment_list = getSegmentList(globals.active_data.min_start_date, globals.active_data.max_end_date);

      globals.segments.domain(segment_list.map(function (d) {
        return d;
      }));

      //logEvent("segments (" + globals.segments.domain().length + "): " + globals.segments.domain(), "preprocessing");

      globals.num_segments = globals.segments.domain().length;
      globals.num_segment_cols = Math.ceil(Math.sqrt(globals.num_segments));
      globals.num_segment_rows = Math.ceil(globals.num_segments / globals.num_segment_cols);

      determineSize(globals.active_data, timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

      //logEvent("num facets after sizing: " + globals.num_facet_cols, "remove");

      adjustSvgSize();

      main_svg.datum(globals.active_data)
        .call(timeline_vis.duration(instance._getAnimationStepDuration())
          .height(globals.height)
          .width(globals.width));

      instance._hideError();
      instance._main_svg.style("opacity", 1);

      if (reset_segmented_layout) {
        mismatches = selectAllWithParent(".timeline_event_g").filter(function (d) {
          return globals.active_event_list.indexOf(d.event_id) === -1;
        });

        matches = selectAllWithParent(".timeline_event_g").filter(function (d) {
          return globals.active_event_list.indexOf(d.event_id) !== -1;
        });
      }

      globals.prev_active_event_list = globals.active_event_list;
    } else {
      instance._main_svg.style("opacity", 0);
      instance._showError("No data available for the selected set of filters.");
    }
  });

  function importIntro() {
    var import_intro = introJs();
    var steps: any = [
      {
        intro: "This tour will describe the types of data that the tool can ingest."
      }
    ];

    if (showDemoData()) {
      steps.push({
        element: ".timeline_storyteller #demo_dataset_picker_label",
        intro: "Load one of several demonstration timeline datasets, featuring timelines that span astronomical epochs or just a single day.",
        position: "right"
      });
    }

    if (instance.options.showImportLoadDataOptions) {
      steps = steps.concat([
        {
          element: ".timeline_storyteller #json_picker_label",
          intro: "Load a timeline dataset in JSON format, where each event is specified by at least a start_date (in either YYYY, YYYY-MM, YYYY-MM-DD, or YYYY-MM-DD HH:MM format); optionally, events can also be specified by end_date, content_text (a text string that describes the event), category, and facet (a second categorical attribute used for distinguishing between multiple timelines).",
          position: "right"
        },
        {
          element: ".timeline_storyteller #csv_picker_label",
          intro: "Load a timeline dataset in CSV format; ensure that the header row contains at least a start_date column; as with JSON datasets, end_date, content_text, category, and facet columns are optional.",
          position: "right"
        },
        {
          element: ".timeline_storyteller #gdocs_picker_label",
          intro: "Load a timeline dataset from a published Google Spreadsheet; you will need to provide the spreadsheet key and worksheet title; the worksheet columns must be formatted as text.",
          position: "right"
        }
      ]);
    }

    if (showDemoData()) {
      steps.push({
        element: ".timeline_storyteller #story_demo_label",
        intro: "Load a demonstration timeline story.",
        position: "right"
      });
    }
    steps.push(
      {
        element: ".timeline_storyteller #story_picker_label",
        intro: "Load a previously saved timeline story in .cdc format.",
        position: "right"
      }
    );

    import_intro.setOptions({
      steps: steps
    });
    import_intro.start();
  }

  function mainIntro() {
    var main_intro = introJs();
    var steps: any = [
      {
        intro: "This tour will introduce the timeline story authoring features."
      }
    ];

    if (instance.options.showViewOptions !== false) {
      steps = steps.concat([
        {
          element: "#representation_picker",
          intro: "Select the visual representation of the timeline or timelines here. Note that some representations are incompatible with some combinations of scales and layouts.",
          position: "bottom"
        },
        {
          element: "#scale_picker",
          intro: "Select the scale of the timeline or timelines here. Note that some scales are incompatible with some combinations of representations and layouts.",
          position: "bottom"
        },
        {
          element: "#layout_picker",
          intro: "Select the layout of the timeline or timelines here. Note that some layouts are incompatible with some combinations of representations and scales.",
          position: "bottom"
        }
      ]);
    }

    if (instance.options.showImportOptions !== false) {
      steps.push(
        {
          element: "#import_visible_btn",
          intro: "This button toggles the import panel, allowing you to open a different timeline dataset or story.",
          position: "right"
        });
    }

    steps = steps.concat([
      {
        element: "#control_panel",
        intro: "This panel contains controls for adding text or image annotations to a timeline, for highlighting and filtering events, and for exporting the timeline or timeline story.",
        position: "right"
      },
      {
        element: "#record_scene_btn",
        intro: "This button records the current canvas of timeline or timelines, labels, and annotations as a scene in a story.",
        position: "top"
      }]);

    main_intro.setOptions({
      steps: steps
    });

    main_intro.start();
  }

  function playbackIntro() {
    var playback_intro = introJs();
    playback_intro.setOptions({
      steps: [
        {
          intro: "This tour will introduce timeline story plaback features."
        },
        {
          element: "#play_scene_btn",
          intro: "You are now in story playback mode. Click this button to leave playback mode and restore the story editing tool panels.",
          position: "top"
        },
        {
          element: "#stepper_container",
          intro: "Scenes in the story appear in this panel. Click on any scene thumbnail to jump to the corresponding scene.",
          position: "top"
        },
        {
          element: "#next_scene_btn",
          intro: "Advance to the next scene by clicking this button.",
          position: "top"
        },
        {
          element: "#prev_scene_btn",
          intro: "Return to the previous scene by clicking this button.",
          position: "top"
        }
      ]
    });
    playback_intro.start();
  }


  selectWithParent()
    .append("div")
    .attr("id", "hint_div")
    .attr("data-hint", "Click on the [TOUR] button for a tour of the interface.")
    .attr("data-hintPosition", "bottom-left")
    .attr("data-position", "bottom-left-aligned")
    .attr("class", "control_div");

  var intro_div = selectWithParent("#hint_div")
    .append("div")
    .attr("id", "intro_div");

  // Give it some time to load, then initialize the hints, otherwise the positioning is wierd
  setTimeout(function () {
    introJs().addHints();
  }, 100);

  intro_div.append("input")
    .attr({
      type: "image",
      name: "Start tour",
      id: "start_intro_btn",
      class: "img_btn_enabled",
      src: imageUrls("info.png"),
      height: 30,
      width: 30,
      title: "Start tour"
    })
    .on("click", function () {
      if (instance.importPanel.visible) {
        importIntro();
      } else if (!instance.playback_mode) {
        mainIntro();
      } else {
        playbackIntro();
      }
    });

  intro_div.append("div")
    .attr("class", "intro_btn")
    .html("<a title='About & getting started' href='../../' target='_blank'><img src='" + imageUrls("q.png") + "' width=30 height=30 class='img_btn_enabled'></img></a>");

  intro_div.append("div")
    .attr("class", "intro_btn")
    .html("<a title='Contact the project team' href='mailto:timelinestoryteller@microsoft.com' target='_top'><img src='" + imageUrls("mail.png") + "' width=30 height=30 class='img_btn_enabled'></img></a>");

  /**
   * Sets the color for the given category
   * @param {string} category The category to change
   * @param {number} categoryIndex The index of the category
   * @param {string} value The category color
   * @returns {void}
   */
  this._setCategoryColor = function (category, categoryIndex, value) {
    globals.color_swap_target = globals.categories.range().indexOf(globals.categories(category));
    //log("category " + categoryIndex + ": " + category + " / " + value + " (index # " + globals.color_swap_target + ")");

    setScaleValue(globals.categories, category, value);

    globals.use_custom_palette = true;
  };

  /**
   * Loads the data from the given state
   * @param {object} state The state to load data from
   * @param {number} min_story_height The minimum height to show the story
   * @returns {void}
   */
  this._loadTimelineFromState = function (state, min_story_height) {
    var timelineData = state.timeline_json_data;
    var hasScenes = !!(state.scenes && state.scenes.length);

    /**
     * {
     *    timeline_json_data: ...,
     *    scenes: ...,
     *    caption_list: ...,
     *    image_list: ...,
     *    annotation_list: ...,
     *    width: ...,
     *    height: ...
     * }
     */

    globals.timeline_json_data = timelineData;
    if (hasScenes) {
      if (state.color_palette !== undefined) {
        globals.color_palette = state.color_palette;
        globals.use_custom_palette = true;
      }
      globals.scenes = state.scenes;
      globals.caption_list = state.caption_list;
      globals.image_list = state.image_list;
      globals.annotation_list = state.annotation_list;

      var min_story_width = instance._render_width,
        max_story_width = instance._render_width;

      globals.scenes.forEach(function (d, i) {
        if (d.s_order === undefined) {
          d.s_order = i;
        }
        if ((d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth()) < min_story_width) {
          min_story_width = (d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth());
        }
        if ((d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth()) > max_story_width) {
          max_story_width = (d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth());
        }
        if ((d.s_height + globals.margin.top + globals.margin.bottom + getScrollbarWidth()) < min_story_height) {
          min_story_height = (d.s_height + globals.margin.top + globals.margin.bottom + getScrollbarWidth());
        }
      });

      if (state.width === undefined) {
        if (max_story_width > instance._render_width) {
          state.width = max_story_width;
        } else {
          state.width = min_story_width;
        }
      }
      if (state.height === undefined) {
        state.height = min_story_height;
      }

      //log("s_width: " + state.width + "; window_width: " + instance._render_width);
      instance._render_width = state.width;
      instance._render_height = state.height;
    }

    initTimelineData(timelineData, hasScenes);

    if (hasScenes) {
      updateNavigationStepper();
    }
  };
}

/**
 * The default set of options
 */
TimelineStoryteller.DEFAULT_OPTIONS = Object.freeze({

  /**
   * If true, the about bar is shown
   */
  showAbout: true,

  /**
   * If true, the Microsoft logo is shown
   */
  showLogo: true,

  /**
   * If true, the chart view options are shown
   */
  showViewOptions: true,

  /**
   * If true, when TimelineStoryteller is initially loaded, it will show the intro import dialog
   */
  showIntro: true,

  /**
   * If true, import options/open will be enabled
   */
  showImportOptions: true,

  /**
   * Shows the hints popup
   */
  showHints: true,

  /**
   * If true, load data options will be shown on the import popup
   */
  showImportLoadDataOptions: true,

  /**
   * If true, animations will be enabled
   */
  animations: true,

  /**
   * The duration between animations
   */
  animationStepDuration: 1200,

  menu: {
    open: {
      label: "Open",
      items: [{
        name: "Load timeline data",
        image: imageUrls("open.png"),
        id: "import_visible_btn",
        click: function (instance) {
          selectWithParent("#filter_div").style("display", "none");
          selectWithParent("#caption_div").style("display", "none");
          instance._addImagePopup.reset();
          selectWithParent("#export_div").style("top", -185 + "px");

          //logEvent("open import panel", "load");

          if (instance.importPanel.visible) {
            instance.importPanel.hide();
            selectWithParent("#gdocs_info").style("height", 0 + "px");
            selectAllWithParent(".gdocs_info_element").style("display", "none");
          } else {
            instance.importPanel.show();
          }
        }
      }]
    },
    annotate: {
      label: "Annotate",
      items: [{
        name: "Add caption",
        image: imageUrls("caption.png"),
        click: function (instance) {
          //logEvent("open caption dialog", "annotation");

          selectWithParent("#filter_div").style("display", "none");
          instance._addImagePopup.reset();
          if (selectWithParent("#caption_div").style("display") !== "none") {
            selectWithParent("#caption_div").style("display", "none");
          } else {
            selectWithParent("#caption_div").style("display", "inline");
          }
        }
      }, {
        name: "Add image",
        image: imageUrls("image.png"),
        click: function (instance) {
          //logEvent("open image dialog", "annotation");

          selectWithParent("#filter_div").style("display", "none");
          selectWithParent("#caption_div").style("display", "none");
          if (!instance._addImagePopup.hidden()) {
            instance._addImagePopup.reset();
          } else {
            instance._addImagePopup.show();
          }
        }
      }, {
        name: "Clear annotations, captions, & images",
        image: imageUrls("clear.png"),
        click: function (instance) {
          instance.clearCanvas();
        }
      }]
    },
    filter: {
      label: "Filter",
      items: [{
        text: "Export",
        image: imageUrls("filter.png"),
        click: function (instance) {
          //logEvent("open filter dialog", "filter");

          if (d3.select(this).attr("class") === "img_btn_enabled") {
            selectWithParent("#caption_div").style("display", "none");
            instance._addImagePopup.reset();
            if (selectWithParent("#filter_div").style("display") === "none") {
              selectWithParent("#filter_div").style("display", "inline");
              globals.effective_filter_width = instance._component_width - parseInt(selectWithParent("#filter_div").style("width"), 10) - getScrollbarWidth() - 10;
              globals.effective_filter_height = instance._component_height - parseInt(selectWithParent("#filter_div").style("height"), 10) - 25 - getScrollbarWidth() - parseInt(selectWithParent("#navigation_div").style("height"), 10) - 10;
            } else {
              selectWithParent("#filter_div").style("display", "none");
            }
          }
        } // The click handler
      }]
    },
    export: {
      label: "Export",
      items: [{
        text: "Export",
        image: imageUrls("export.png"),
        click: function (instance) {
          selectWithParent("#filter_div").style("display", "none");
          selectWithParent("#caption_div").style("display", "none");
          instance._addImagePopup.reset();

          instance.importPanel.hide();

          //logEvent("show export panel", "export");

          if (selectWithParent("#export_div").style("top") !== -185 + "px") {
            selectWithParent("#export_div").style("top", -185 + "px");
          } else {
            selectWithParent("#export_div").style("top", "25%");
          }
        } // The click handler
      }]
    }
  },
  export: {
    /**
     * If true, the image export options will be available
     */
    images: true
  },
  import: {
    storyMenu: {
      items: {
        demo: {
          visible: function (instance) {
            return instance._showDemoStory();
          },
          text: "Load Demo Story",
          image: imageUrls("demo_story.png"),
          click: function (instance) {
            //logEvent("demo story source", "load");

            selectWithParent("#timeline_metadata").style("display", "none");
            selectAllWithParent(".gdocs_info_element").style("display", "none");
            instance.importPanel.hide();

            selectWithParent("#gdocs_info").style("height", 0 + "px");
            selectWithParent("#gdoc_spreadsheet_key_input").property("value", "");
            selectWithParent("#gdoc_worksheet_title_input").property("value", "");

            setTimeout(function () {
              instance.load((<any>window).timeline_story_demo_story, true);
            }, 500);
          }
        },
        file: {
          text: "Load Saved Story",
          image: imageUrls("story.png"),
          width: 40,
          height: 40,
          init: function (inst, element) {
            element
              .append("input")
              .attr({
                type: "file",
                id: "story_uploader",
                style: "opacity:0;width:100%;height:100%;cursor:pointer;cursor:pointer",
                accept: ".cdc"
              })
              .on("change", function () {
                var file = this.files[0];
                globals.reader.readAsText(file);

                globals.reader.onload = function (e) {
                  var contents = e.target.result;
                  inst.load(JSON.parse(contents), true);
                };
              });
          }
        }
      }
    },
    dataMenu: {
      items: {
        demo: {
          visible: function (instance) {
            return instance._showDemoData();
          },
          name: "Load Demo Data",
          image: imageUrls("demo.png"),
          init: function (that, element) {
            var demoData = (<any>window).timeline_story_demo_data;
            var demoOptions = Object.keys(demoData).map(path => {
              return {
                path,
                tl_name: demoData[path].name
              };
            });
            element.append("select")
              .attr("id", "demo_dataset_picker")
              .attr("title", "Load demo dataset")
              .attr("style", "top:0;left:0")
              .on("change", function () {
                var source = d3.select(this).property("value");
                if (source !== "") {
                  setTimeout(() => {
                    //logEvent("loading (demo_story)", "load");
                    that.load({ timeline_json_data: demoData[source].data }, false);
                  }, 500);
                } else {
                  globals.source = source;
                }
              })
              .selectAll("option")
              .data([{ "path": "", "tl_name": "" }].concat(demoOptions)) // Blank + demo options
              .enter()
              .append("option")
              .attr("value", function (d) { return d.path; })
              .text(function (d) { return d.tl_name; });
          }
        },
        json: {
          name: "Load from JSON",
          image: imageUrls("json.png"),
          init: (inst, element) => {
            element
              .append("input")
              .attr({
                type: "file",
                id: "json_uploader",
                style: "display:none;",
                accept: ".json"
              })
              .on("change", function () {
                var file = this.files[0];
                globals.reader.readAsText(file);
                globals.reader.onload = function (e) {
                  var contents = e.target.result;
                  var blob = new Blob([contents], { type: "application/json" });
                  setTimeout(() => {
                    //logEvent("loading (json)", "load");
                    d3.json(URL.createObjectURL(blob), function (error, data) {
                      inst.load(data.timeline_json_data ? data : { timeline_json_data: data }, false);
                    });
                  }, 500);
                };
              });
          },
          click: (inst, element) => {
            element.select("#json_uploader").node().click();
          }
        },
        csv: {
          name: "Load from CSV",
          image: imageUrls("csv.png"),
          init: (inst, element) => {
            element
              .append("input")
              .attr({
                type: "file",
                id: "csv_uploader",
                style: "opacity:0;width:100%;height:100%;cursor:pointer",
                accept: ".csv"
              })
              .on("change", function () {
                var file = this.files[0];
                globals.reader.readAsText(file);
                globals.reader.onload = (e) => {
                  var contents = e.target.result;
                  var blob = new Blob([contents], { type: "application/csv" });
                  setTimeout(() => {
                    //logEvent("loading (csv)", "load");
                    d3.csv(URL.createObjectURL(blob), function (error, data) {
                      inst.load({ timeline_json_data: data }, false);
                    });
                  }, 500);
                };
              });
          }
        },
        gdocs: {
          name: "Load from Google Spreadsheet",
          image: imageUrls("gdocs.png"),
          click: () => {
            if (selectAllWithParent(".gdocs_info_element").style("display") !== "none") {
              selectWithParent("#gdocs_info").style("height", 0 + "px");
              selectAllWithParent(".gdocs_info_element").style("display", "none");
            } else {
              selectWithParent("#gdocs_info").style("height", 27 + "px");
              setTimeout(function () {
                selectAllWithParent(".gdocs_info_element").style("display", "inline");
              }, 500);
            }
          }
        }
      }
    }
  }
});

/**
 * Initializes the popup menu
 * @param {object} menu The JSON object representing the menu
 * @returns {void}
 * {
 *    export: {
 *      label: "Export",
 *      items: [{
 *         text: "Export",
 *         image: "http://image.com/img.jpg",
 *         height: 30,// optional,
 *         width: 30, // optional
 *         class: "custom" // The custom class to bind to this item,
 *         click: function() { } // The click handler
 *      }]
 *    },
 *    annotate: {
 *      label: "Annotate"
 *    }
 * }
 */
TimelineStoryteller.prototype._initializeMenu = function (menu) {
  var that = this;
  var sectionNames = Object.keys(menu);

  // Clear it out first
  this._control_panel.selectAll("*").remove();

  sectionNames.forEach(function (name, i) {
    var section = menu[name];
    // No need for an HR if it is the first item
    if (i > 0) {
      that._control_panel.append("hr")
        .style("margin-bottom", "0px")
        .attr("class", "menu_hr");
    }

    that._control_panel.append("text")
      .attr("class", "menu_label")
      .text(section.label);

    // support both arrays and object based items definitions.
    var sectionItems = {};
    if (section.items) {
      if (section.items.forEach) {
        section.items.forEach((item, itemIdx) => {
          sectionItems["item" + itemIdx] = item;
        });
      } else {
        sectionItems = section.items;
      }
    }
    Object.keys(sectionItems).forEach(function (itemKey) {
      var item = sectionItems[itemKey];
      var itemEle =
        that._control_panel.append("input")
          .attr({
            type: "image",
            name: item.text,
            class: "img_btn_disabled" + (" " + (item.class || "")),
            src: item.image,
            title: item.text
          });
      itemEle.style({
        height: (item.height || 30) + "px",
        width: (item.width || 30) + "px"
      });
      if (item.id) {
        itemEle.attr("id", item.id);
      }
      if (item.click) {
        itemEle.on("click", function () {
          item.click.call(this, that);
        });
      }
    });
  });

  selectAllWithParent("#menu_div").style("display", sectionNames.length > 0 ? "block" : "none");
};

/**
 * Loads annotations for the current scene
 * @param {Scene} scene The scene to load annotations for
 * @param {number} scene_index The index of the scene
 * @returns {void}
 */
TimelineStoryteller.prototype._loadAnnotations = function (scene, scene_index) {
  this.clearCanvas();

  this._prevTransitioning = false;
  const that = this;

  //log("Loading Annotations");
  if (this._currentSceneIndex !== scene_index) {
    return;
  }

  // is the legend expanded in this scene?
  globals.legend_expanded = scene.s_legend_expanded;
  if (scene.s_legend_expanded) {
    this.expandLegend();
  } else {
    this.collapseLegend();
  }

  /**
   * Creates a mapper, that adds a type property
   * @param {string} type The type of the item
   * @returns {object} An object with the type and item properties
   */
  function mapWithType(type) {
    return function (item) {
      return {
        id: item.id,
        type,
        item
      };
    };
  }

  this._pruneAnnotations();

  var captionAnnos = globals.caption_list.map(mapWithType("caption"));
  var imageAnnos = globals.image_list.map(mapWithType("image"));
  var textAnnos = globals.annotation_list.map(mapWithType("annotation"));

  // TODO: this would be better if the scenes had a more generic property called "annotations", that have a list of all the
  // annotations that had a "type" property

  // These are are technically annotations, just different types, so concat them all together
  const allAnnos = captionAnnos.concat(imageAnnos).concat(textAnnos);

  let nextId = getHighestId(allAnnos);
  allAnnos
    .filter(function (anno) { // Filter out annotations not on this scene
      // Basically maps the type to scene.s_images or scene.s_annotations or scene.s_captions
      var sceneList = scene["s_" + anno.type + "s"];

      for (var i = 0; i < sceneList.length; i++) { // eslint-disable-line no-shadow
        // Basically the id property in the scene, so image_id or caption_id or annotation_id
        if (sceneList[i][anno.type + "_id"] === anno.item.id) {
          return true;
        }
      }
    })

    // We sort the annotations by z-order, and add the annotations in that order
    // this is important cause with svgs, the order in which elements are added dictates their z-index
    .sort(function (a, b) { return (a.item.z_index || 0) - (b.item.z_index || 0); })

    // Iterate through all of our annotations
    .forEach(function (anno) {
      // Make a copy so existing scenes do not get modified
      const item = Object.assign({}, anno.item);
      item.id = ++nextId;

      if (anno.type === "caption") {
        addCaption(item.caption_text, item.caption_width * 1.1, item.x_rel_pos, item.y_rel_pos, item);
      } else if (anno.type === "image") {
        addImage(that._timeline_vis, item.i_url, item.x_rel_pos, item.y_rel_pos, item.i_width, item.i_height, item);
      } else {
        var itemSel = selectWithParent("#event_g" + item.item_index).select("rect.event_span");
        var itemEle = itemSel[0][0].__data__,
          item_x_pos = 0,
          item_y_pos = 0;

        if (scene.s_representation !== "Radial") {
          item_x_pos = itemEle.rect_x_pos + itemEle.rect_offset_x + globals.padding.left + globals.unit_width * 0.5;
          item_y_pos = itemEle.rect_y_pos + itemEle.rect_offset_y + globals.padding.top + globals.unit_width * 0.5;
        } else {
          item_x_pos = itemEle.path_x_pos + itemEle.path_offset_x + globals.padding.left;
          item_y_pos = itemEle.path_y_pos + itemEle.path_offset_y + globals.padding.top;
        }

        const { element } = annotateEvent(that._timeline_vis, item.content_text, item_x_pos, item_y_pos, item.x_offset, item.y_offset, item.x_anno_offset, item.y_anno_offset, item.label_width, item.item_index, item);
        element
          .transition()
          .duration(that.options.animations ? 50 : 0)
          .style("opacity", 1)
          .each(function () {
            // If after running the transition, the scene has changed, then hide this annotation.
            if (that._currentSceneIndex !== scene_index) {
              this.style.opacity = 0;
            }
          });
      }
      if (anno.type === "caption") {
        globals.caption_list.push(item);
      } else if (anno.type === "image") {
        globals.image_list.push(item);
      } else {
        globals.annotation_list.push(item);
      }
    });

  // Set read-only state for annotations in playback mode
  d3.selectAll(".annotation_control, .annotation_drag_area, .image_drag_area, .caption_drag_area")
    .style("display", globals.playback_mode ? "none" : "");

  // toggle selected events in the scene
  this._main_svg.selectAll(".timeline_event_g")[0].forEach(function (event) {
    if (scene.s_selections.indexOf(event.__data__.event_id) !== -1) {
      event.__data__.selected = true;
      selectWithParent("#event_g" + event.__data__.event_id)
        .selectAll(".event_span")
        .attr("filter", "url(#drop-shadow)")
        .style("z-index", 1)
        .style("stroke", "#f00")
        .style("stroke-width", "1.25px");
      selectWithParent("#event_g" + event.__data__.event_id)
        .selectAll(".event_span_component")
        .style("z-index", 1)
        .style("stroke", "#f00")
        .style("stroke-width", "1px");
    } else {
      event.__data__.selected = false;
      selectWithParent("#event_g" + event.__data__.event_id)
        .selectAll(".event_span")
        .attr("filter", "none")
        .style("stroke", "#fff")
        .style("stroke-width", "0.25px");
      selectWithParent("#event_g" + event.__data__.event_id)
        .selectAll(".event_span_component")
        .style("stroke", "#fff")
        .style("stroke-width", "0.25px");
    }
  });
  if (this._timeline_vis.tl_representation() !== "Curve") {
    selectWithParent("#timecurve").style("visibility", "hidden");
  } else {
    selectWithParent("#timecurve").style("visibility", "visible");
  }
  this._main_svg.style("visibility", "visible");
};

/**
 * Prunes annotations which were left in the global scene list, but never referenced anymore
 * @returns {void}
 */
TimelineStoryteller.prototype._pruneAnnotations = function () {
  function prune(type) {
    if (globals[`${type}_list`]) {
      const usedAnnotations = {};
      (globals.scenes || []).forEach(s => {
        (s[`s_${type}s`] || []).forEach(annoRef => {
          usedAnnotations[annoRef[`${type}_id`]] = true;
        });
      });

      // Filter the annotation list to used annotations
      globals[`${type}_list`] = globals[`${type}_list`].filter(n => usedAnnotations[n.id]);
    }
  }
  prune("annotation");
  prune("image");
  prune("caption");
};

/**
 * Gets the animation duration for each of the steps in the animations
 * @return {number} The duration of a step in the animation
 */
TimelineStoryteller.prototype._getAnimationStepDuration = function () {
  if (this.options.animations) {
    return this.options.animationStepDuration;
  }
  return 0;
};

/**
 * Shows an error on the display area
 * @param {string} text The text to display
 * @returns {void}
 */
TimelineStoryteller.prototype._showError = function (text) {
  this._errorArea.html(text);
  this._errorArea.style("display", "");
};

/**
 * Hides the errors on the display area
 * @returns {void}
 */
TimelineStoryteller.prototype._hideError = function () {
  this._errorArea.html("");
  this._errorArea.style("display", "none");
};

/**
 * Event listener for when the TimelineStoryteller is resized
 */
TimelineStoryteller.prototype._onResized = debounce(function (updateVis) {
  // Only tweak the size if we are not playing back
  if (!this.playback_mode) {
    this._component_width = this.parentElement.clientWidth;
    this._component_height = this.parentElement.clientHeight;

    // EFFECTIVE_HEIGHT
    globals.width = this._component_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
    globals.height = this._component_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth();

    this._render_width = this._component_width;
    this._render_height = this._component_height;

    var vis = this._timeline_vis;
    if (typeof updateVis === "undefined" && (updateVis !== false) && vis && this._main_svg) {
      var scale = vis.tl_scale();
      this._determineSize(globals.active_data, scale, vis.tl_layout(), vis.tl_representation());

      this._adjustSvgSize();

      this._main_svg.call(vis.duration(this.options.animations ? 1200 : 0)
        .tl_scale(scale)
        .height(globals.height)
        .width(globals.width));
    }
  }
}, 500);

/**
 * Records the current scene
 * @returns {void}
 */
TimelineStoryteller.prototype._recordScene = function () {
  selectAllWithParent("foreignObject").remove();

  selectWithParent("#stepper_svg_placeholder").remove();

  globals.record_width = globals.width;
  globals.record_height = globals.height;

  var timeline_vis = this._timeline_vis;

  //logEvent("scene " + (this._currentSceneIndex + 2) + " recorded: " + timeline_vis.tl_representation() + " / " + timeline_vis.tl_scale() + " / " + timeline_vis.tl_layout(), "record");

  var scene_captions = [];
  var scene_images = [];
  var scene_annotations = [];
  var scene_selections = [];

  this._main_svg.selectAll(".timeline_caption").each(function () {
    var scene_caption = {
      caption_id: Math.abs(parseInt(this.getAttribute("data-id"), 10))
    };
    scene_captions.push(scene_caption);
  });

  this._main_svg.selectAll(".timeline_image").each(function () {
    var scene_image = {
      image_id: Math.abs(parseInt(this.getAttribute("data-id"), 10))
    };
    scene_images.push(scene_image);
  });

  this._main_svg.selectAll(".event_annotation").each(function () {
    var scene_annotation = {
      annotation_id: Math.abs(parseInt(this.getAttribute("data-id"), 10))
    };
    scene_annotations.push(scene_annotation);
  });

  this._main_svg.selectAll(".timeline_event_g")[0].forEach(function (event) {
    if (event.__data__.selected === true) {
      scene_selections.push(event.__data__.event_id);
    }
  });

  for (var i = 0; i < globals.scenes.length; i++) {
    if (globals.scenes[i].s_order > this._currentSceneIndex) {
      globals.scenes[i].s_order++;
    }
  }

  var scene = {
    s_width: globals.width,
    s_height: globals.height,
    s_scale: timeline_vis.tl_scale(),
    s_layout: timeline_vis.tl_layout(),
    s_representation: timeline_vis.tl_representation(),
    s_categories: globals.selected_categories,
    s_facets: globals.selected_facets,
    s_segments: globals.selected_segments,
    s_filter_type: globals.filter_type,
    s_legend_x: globals.legend_x,
    s_legend_y: globals.legend_y,
    s_legend_expanded: globals.legend_expanded,
    s_captions: scene_captions,
    s_images: scene_images,
    s_annotations: scene_annotations,
    s_selections: scene_selections,
    s_timecurve: selectWithParent("#timecurve").attr("d"),
    s_order: this._currentSceneIndex + 1
  };
  globals.scenes.push(scene);

  function copyAnnotations(list, refList, type) {
    let highestAnnoId = getHighestId(list);
    const idProp = type + "_id";
    return list.concat(refList.map((sceneAnno) => {
      const existingAnnotation = list.filter(anno => anno.id === sceneAnno[idProp])[0];
      const newAnnotation = Object.assign({}, existingAnnotation);
      const newId = ++highestAnnoId;

      // TODO: Dirty, update the element id to be the right one
      selectAllWithParent(`[data-type="${type}"][data-id="${existingAnnotation.id}"]`)
        .attr("data-id", newId);

      // Update the existing annotation to be a "new" annotation, so any future changes will only affect this one.
      existingAnnotation.id = newId;
      return newAnnotation;
    }));
  }

  // Create copies of the annotations so modifications do not change the source scene
  globals.image_list = copyAnnotations(globals.image_list, scene_images, "image");

  // Create copies of the annotations so modifications do not change the source scene
  globals.annotation_list = copyAnnotations(globals.annotation_list, scene_annotations, "annotation");

  // Create copies of the captions so modifications do not change the source scene
  globals.caption_list = copyAnnotations(globals.caption_list, scene_captions, "caption");

  this._currentSceneIndex++;

  if (isIE11) {
    this._updateNavigationStepper();

    // Dispatch after state has changed
    this._dispatch.stateChanged();
  } else {
    var compressed = !(this.options.export && this.options.export.images);
    var renderOptions: any = {
      backgroundColor: "white"
    };

    if (compressed) {
      renderOptions.encoderType = "image/jpeg";
      renderOptions.scale = 300 / Math.max(this._render_width, this._render_height);
    }

    svgImageUtils.svgAsPNG(document.querySelector(".timeline_storyteller #main_svg"), globals.gif_index, renderOptions);

    var that = this;
    var checkExist = setInterval(function () {
      if (document.getElementById("gif_frame" + globals.gif_index) !== null) {
        //log("gif_frame" + globals.gif_index + " Exists!");
        globals.scenes[globals.scenes.length - 1].s_src = (<any>(document.getElementById("gif_frame" + globals.gif_index))).src;
        document.getElementById("gif_frame" + globals.gif_index).remove();
        globals.gif_index++;
        that._updateNavigationStepper();
        clearInterval(checkExist);

        // Dispatch after state has changed
        that._dispatch.stateChanged();
      }
    }, 100); // check every 100ms
  }
  return true;
};

/**
 * Parses the start_date and end_date properties of the given item
 * @param {object} item The item to parse start & end dates for
 * @returns {void}
 */
TimelineStoryteller.prototype._parseStartAndEndDates = function (item) {
  let startMoment;
  let endMoment;
  let dateFormat = "Y-MM-DD HH:mm Z";

  // Try to parse the start date from the original
  // If that fails, try to estimate from the end date
  // Otherwise fall back to todays day
  // NOTE: isValid returns true EVEN IF start_date is empty/null/undefined
  if (item.start_date && moment(item.start_date).isValid()) {
    startMoment = moment(item.start_date, dateFormat); // account for UTC offset

    // Use the end date if the start date is not valid
  } else if (item.end_date && moment(item.end_date).isValid()) {
    startMoment = moment(item.end_date, dateFormat);
  } else {
    startMoment = moment(new Date());
  }

  // Try to parse the end date from the original
  // If that fails, try to estimate from the start date
  if (item.end_date && moment(item.end_date).isValid()) {
    endMoment = moment(item.end_date, dateFormat); // account for UTC offset
  } else {
    // Use the start_date to approximate end date
    endMoment = moment(startMoment);
  }

  // We use year based when the data is numeric
  // TODO: Think about what happens if there is a mix between year only dates and full dates in the same dataset.
  const isYearBased =
    (item.start_date !== undefined && globals.isNumber(item.start_date)) ||
    (item.end_date !== undefined && globals.isNumber(item.end_date));

  // is start date a numeric year?
  if (isYearBased) {
    // set end_date to end of that year as date object
    item.start_date = startMoment.toDate();
    item.end_date = endMoment.endOf("year").toDate();
  } else { // start date is not a numeric year
    globals.date_granularity = "days";
    item.start_date = startMoment.startOf("hour").toDate();
    item.end_date = endMoment.endOf("hour").toDate();
  }
};

/**
 * Initializes the import panel
 * @returns {void}
 */
TimelineStoryteller.prototype._initializeImportPanel = function () {
  this.importPanel.element.append("div")
    .attr("id", "data_picker");

  this._initializeImportDataMenus();
};

/**
 * Initializes the sections in the import panel
 * @return {void}
 */
TimelineStoryteller.prototype._initializeImportDataMenus = function () {
  selectAllWithParent("#data_picker .data_story_picker").remove();

  this._initializeImportDataSection();
  this._initializeImportStorySection();
};

/**
 * Initializes the data section within the import dialog
 * @returns {void}
 */
TimelineStoryteller.prototype._initializeImportDataSection = function () {
  if (this.options.showImportLoadDataOptions) {
    var importOptions = this.options.import || {};
    var importDataMenu = (importOptions.dataMenu || {}).items || {};
    var importDataItems = Object.keys(importDataMenu);

    // We really only need to add the section if there is any items to show
    if (importDataItems.length) {
      var dataset_picker = selectWithParent("#data_picker").append("div")
        .attr("class", "data_story_picker import-load-data-option");

      dataset_picker.append("text")
        .attr("class", "ui_label")
        .text("Load timeline data");

      importDataItems.forEach((key) => {
        var buttonEle = this._createImportPanelButton(importDataMenu[key]);
        if (buttonEle) {
          dataset_picker.node().appendChild(buttonEle.node());
        }
      });
    }
  }
};

/**
 * Initializes the story section within the import dialog
 * @returns {void}
 */
TimelineStoryteller.prototype._initializeImportStorySection = function () {
  var importOptions = this.options.import || {};
  var storyMenu = (importOptions.storyMenu || {}).items || {};
  var importItems = Object.keys(storyMenu);

  // We really only need to add the section if there is any items to show
  if (importItems.length) {
    var story_picker = selectWithParent("#data_picker").append("div")
      .attr("class", "data_story_picker")
      .style("border-right", "1px solid transparent");

    story_picker.append("text")
      .attr("class", "ui_label")
      .text("Load timeline story");

    importItems.forEach((key) => {
      var buttonEle = this._createImportPanelButton(storyMenu[key]);
      if (buttonEle) {
        story_picker.node().appendChild(buttonEle.node());
      }
    });
  }
};

/**
 * Creates an import panel button from the given button config
 * @param {object} button The button configuration
 * @return {d3.Selection} The d3 button
 */
TimelineStoryteller.prototype._createImportPanelButton = function (button) {
  if ((typeof button.visible === "function" && button.visible(this)) ||
    button.visible === undefined ||
    (typeof button.visible === "boolean" && button.visible)) {
    var sizeCss = "height:" + (button.height || 40) + "px;width:" + (button.width || 40) + "px";
    var item = d3.select(document.createElement("div"))
      .attr("class", "import-button")
      .attr("style", sizeCss);
    item
      .append("img")
      .attr({
        name: button.text,
        class: "img_btn_enabled " + (button.class || ""),
        title: button.text,
        src: button.image,
        style: "width:100%;height:100%;position:absolute;left:0;top:0"
      });
    item.on("click", () => {
      if (button.click) {
        button.click(this, element);
      }
    });
    var element = item.append("div").attr("class", "import-button-container");
    if (button.init) {
      button.init(this, element);
    }
    return item;
  }
};

/**
 * Listener for when an image is selected through the addImageDialog
 * @param {string} image_url The image url that was selected
 * @returns {void}
 */
TimelineStoryteller.prototype._onAddImageSelected = function (image_url) {
  const highestImageId = getHighestId(globals.image_list);
  const imageId = highestImageId + 1;

  //logEvent("image " + imageId + " added: <<" + image_url + ">>", "annotation");

  var new_image = new Image();
  new_image.name = image_url;
  new_image.onload = getWidthAndHeight;
  new_image.onerror = loadFailure;
  new_image.src = image_url;

  function loadFailure() {
    //logEvent("'" + this.name + "' failed to load.", "annotation");

    return true;
  }

  const that = this;
  function getWidthAndHeight() {
    //logEvent("image " + imageId + " is " + this.width + " by " + this.height + " pixels in size.", "annotation");

    var image_width = this.width,
      image_height = this.height,
      scaling_ratio = 1;

    // reduce size of large images
    if (image_width >= globals.width * 0.5) {
      image_width = globals.width * 0.5;
      scaling_ratio = image_width / this.width;
      image_height = this.height * scaling_ratio;
    }
    if (image_height >= globals.height * 0.5) {
      image_height = globals.height * 0.5;
      scaling_ratio = image_height / this.height;
      image_width = this.width * scaling_ratio;
    }

    var image_list_item = {
      id: imageId,
      i_url: image_url,
      i_width: image_width,
      i_height: image_height,
      x_rel_pos: 0.5,
      y_rel_pos: 0.25,
      z_index: getNextZIndex()
    };

    globals.image_list.push(image_list_item);
    addImage(that._timeline_vis, image_url, 0.5, 0.25, image_width, image_height, image_list_item);
  }
};

/**
 * Updates the selected filters from the given filter container
 * @param {d3.Selection} filterContainer The filter container to grab the new filters from
 * @param {string} type The type of filter "selected_categories", "selected_facets", "selected_segments"
 * @returns {void}
 */
TimelineStoryteller.prototype._updateSelectedFilters = function (filterContainer, type) {
  const newOptions = filterContainer
    .selectAll("option")
    .filter(function () {
      return this.selected;
    });
  if (newOptions.size() === 0) {
    filterContainer
      .selectAll("option")
      .attr("selected", false);
    if (globals[type]) {
      globals[type].each(function () {
        this.selected = true;
      });
    }
  } else {
    globals[type] = newOptions;
    if (globals.filter_type === "Hide") {
      globals.dispatch.remove(globals.selected_categories, globals.selected_facets, globals.selected_segments);
    } else if (globals.filter_type === "Emphasize") {
      globals.dispatch.Emphasize(globals.selected_categories, globals.selected_facets, globals.selected_segments);
    }
  }
};

/**
 * Expands the legend
 * @returns {void}
 */
TimelineStoryteller.prototype.expandLegend = function () {
  //logEvent("legend expanded", "legend");

  globals.legend_expanded = true;
  const animationLength = this._getAnimationStepDuration();
  selectWithParent(".legend")
    .transition()
    .duration(animationLength);
  selectWithParent(".legend").select(".legend_rect")
    .transition()
    .duration(animationLength)
    .attr("height", globals.track_height * (globals.num_categories + 1))
    .attr("width", globals.max_legend_item_width + 5 + globals.unit_width + 10);
  selectWithParent(".legend").select("#legend_expand_btn")
    .transition()
    .duration(animationLength)
    .attr("x", globals.max_legend_item_width + 5 + globals.unit_width - 10);
  selectWithParent(".legend").select(".legend_title")
    .transition()
    .duration(animationLength)
    .attr("dx", "0em")
    .attr("transform", "translate(5,0)rotate(0)");
  selectWithParent(".legend").selectAll(".legend_element_g text")
    .transition()
    .duration(animationLength)
    .style("fill-opacity", "1")
    .style("display", "inline")
    .attr("transform", "translate(0,-35)");
  selectWithParent(".legend").selectAll(".legend_element_g rect")
    .transition()
    .duration(animationLength)
    .attr("transform", "translate(0,-35)");
  selectWithParent(".legend").selectAll(".legend_element_g foreignObject")
    .transition()
    .duration(animationLength)
    .attr("transform", "translate(" + globals.legend_spacing + ",-35)");
};

/**
 * Collapses the legend
 * @returns {void}
 */
TimelineStoryteller.prototype.collapseLegend = function () {
  //logEvent("legend minified", "legend");

  globals.legend_expanded = false;

  const animationLength = this._getAnimationStepDuration();
  selectWithParent(".legend")
    .transition()
    .duration(animationLength)
    .style("z-index", 1);
  selectWithParent(".legend").select(".legend_rect")
    .transition()
    .duration(animationLength)
    .attr("height", 35 + globals.track_height * (globals.num_categories + 1))
    .attr("width", 25);
  selectWithParent(".legend").select("#legend_expand_btn")
    .transition()
    .duration(animationLength)
    .attr("x", 25);
  selectWithParent(".legend").select(".legend_title")
    .transition()
    .duration(animationLength)
    .attr("dx", "-4.3em")
    .attr("transform", "translate(0,0)rotate(270)");
  selectWithParent(".legend").selectAll(".legend_element_g text")
    .transition()
    .duration(animationLength)
    .style("fill-opacity", "0")
    .style("display", "none")
    .attr("transform", "translate(0,0)");
  selectWithParent(".legend").selectAll(".legend_element_g rect")
    .transition()
    .duration(animationLength)
    .attr("transform", "translate(0,0)");
  selectWithParent(".legend").selectAll(".legend_element_g foreignObject")
    .transition()
    .duration(animationLength)
    .attr("transform", "translate(" + globals.legend_spacing + ",0)");
};

/**
 * Scales the UI
 * @param {number} [scale=1] The scale of the UI
 * @returns {void}
 */
TimelineStoryteller.prototype.setUIScale = function (scale) {
  scale = typeof scale === "undefined" ? 1 : scale;
  this.scale = scale;
  selectWithParent("#footer").style("transform", "scale(" + scale + ")");
  selectWithParent("#logo_div").style("transform", "scale(" + scale + ")");
  selectWithParent("#option_div").style("transform", "scale(" + scale + ")");
  this.importPanel.element.style("transform", "scale(" + scale + ")");
  selectWithParent("#navigation_div").style("transform", "scale(" + scale + ")");
  selectWithParent("#menu_div").style("transform", "scale(" + scale + ")");
  selectWithParent("#hint_div").style("transform", "scale(" + scale + ")");
};

/**
 * Applies the current options to the elements on the page
 * @param {boolean} [updateMenu=false] Whether or not to update the menu
 * @returns {void}
 */
TimelineStoryteller.prototype.applyOptions = function (updateMenu) {
  var options = this.options;
  selectWithParent("#footer").style("display", options.showAbout === false ? "none" : null);
  selectWithParent("#logo_div").style("display", options.showLogo === false ? "none" : null);
  selectWithParent("#option_div").style("display", options.showViewOptions === false ? "none" : null);
  selectWithParent().classed("show-about-bar", options.showAbout);
  this.importPanel.element.style("display", this.onIntro && options.showIntro === false ? "none" : null);

  // showImportOptions
  var showImportVisible = options.showImportOptions === false ? "none" : null;
  selectWithParent("#data_picker").style("display", showImportVisible);
  selectWithParent("#menu_div .menu_label").style("display", showImportVisible);
  selectWithParent("#menu_div #import_visible_btn").style("display", showImportVisible);

  // showAbout
  selectWithParent("#navigation_div").style("bottom", (options.showAbout === false || this.playback_mode) ? "20px" : "50px");

  // showImportLoadDataOptions
  selectAllWithParent(".import-load-data-option").style("display", options.showImportLoadDataOptions === false ? "none" : null);

  // allowImageExport
  selectAllWithParent(".export--image").style("display", (!options.export || options.export.images === false) ? "none" : null);

  selectAllWithParent("#hint_div").style("display", options.showHints === false ? "none" : null);

  if (updateMenu) {
    this._initializeMenu(options.menu);
    this._initializeImportDataMenus();
  }
};

/**
 * Sets the rendering options on the timeline storyteller
 * @param {object} options The options to set
 * @returns {void}
 */
TimelineStoryteller.prototype.setOptions = function (options) {
  options = options || {};
  var updateMenu = false;
  for (var key in options) {
    // If it is a supported option
    if (TimelineStoryteller.DEFAULT_OPTIONS.hasOwnProperty(key)) {
      var value = typeof options[key] !== "undefined" ? options[key] : TimelineStoryteller.DEFAULT_OPTIONS[key];
      this.options[key] = value;
      if (key === "menu") {
        updateMenu = true;
      }
      if (key === "import") {
        updateMenu = true;
      }
    }
  }
  this.applyOptions(updateMenu);
};

/**
 * Clears the canvas of annotations
 * @returns {void}
 */
TimelineStoryteller.prototype.clearCanvas = function () {
  //logEvent("clear annotations", "annotation");

  this._main_svg.selectAll(".timeline_event_g")[0].forEach(function (event) {
    event.__data__.selected = false;
    selectWithParent("#event_g" + event.__data__.event_id)
      .selectAll(".event_span, .event_span_component")
      .attr("filter", "none")
      .style("stroke", "#fff")
      .style("stroke-width", "0.25px");
  });

  this._main_svg.selectAll(".timeline_caption, .timeline_image, .event_annotation").remove();
};

/**
 * Updates the set of currently loaded data
 * @param {object[]} data The data to load into TimelineStoryteller
 * @returns {void}
 */
TimelineStoryteller.prototype.update = function (data) {
  var unique_values = d3.map([]);
  var unique_data = [];

  globals.timeline_json_data = data;

  data.forEach(function (d) {
    unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
  });

  unique_values.forEach(function (d) {
    unique_data.push(unique_values.get(d));
  });

  //logEvent("Updating data", "update");

  // TODO: Check if DrawTimeline hasn't been called yet

  globals.active_data = unique_data;
  globals.all_data = unique_data;

  // updateCategories

  var categories = d3.map(function (d) {
    return d.category;
  }).keys();
  var existingCategories = globals.categories.domain();

  // Don't worry about removed/changed categories, hopefully if you called updateData
  // the underlying dataset has not removed categories, so handle adding only
  if (categories.length > existingCategories.length) {
    var existingColors = existingCategories.map(globals.categories);

    // determine event categories from data
    globals.categories.domain(categories);

    existingColors.forEach(function (color, i) {
      // Restore existing colors
      setScaleValue(globals.categories, existingCategories[i], color);
    });

    globals.num_categories = globals.categories.domain().length;
  }

  this._drawTimeline(globals.active_data);
};

/**
 * Loads the given set of data into timeline storyteller
 * @param {object} state The state to load into the story teller
 * @param {boolean} storyMode If true, the timeline storyteller will load the data and load into story mode
 * @param {boolean} skipIntro If true, the intro import dialog will be skipped
 * @param {number} delay The load delay for the story
 * @returns {void}
 */
TimelineStoryteller.prototype.load = function (state, storyMode, skipIntro, delay) {
  //logEvent("loading " + (storyMode ? "(story)" : "(json_parsed)"), "load");

  var that = this;
  var hasScenes = !!(state.scenes && state.scenes.length);
  function delayLoad(resolve) {
    "use strict";
    that._loadTimeline(state, skipIntro).then(resolve);
  }

  return new Promise(resolve => {
    delay = typeof delay === "undefined" ? 500 : delay;
    setTimeout(function () {
      // Give it time for the UI to load
      that.setPlaybackMode(!!storyMode, false);

      if (storyMode) {
        //logEvent("story load", "load");

        selectWithParent("#timeline_metadata").style("display", "none");
        selectAllWithParent(".gdocs_info_element").style("display", "none");
        that.importPanel.hide();

        selectWithParent("#gdocs_info").style("height", 0 + "px");
        selectWithParent("#gdoc_spreadsheet_key_input").property("value", "");
        selectWithParent("#gdoc_worksheet_title_input").property("value", "");
      }

      if (delay > 0 || hasScenes) {
        setTimeout(() => delayLoad(resolve), delay);
      } else {
        delayLoad(resolve);
      }
    }, delay ? 100 : 0);
  });
};

/**
 * Saves the current state as JSON
 * @returns {object} The story in JSON format
 */
TimelineStoryteller.prototype.saveState = function () {
  return {
    "version": 2,
    "timeline_json_data": globals.timeline_json_data,
    "name": "timeline_story.cdc",
    "scenes": globals.scenes,
    "width": this._component_width,
    "height": this._component_height,
    "color_palette": globals.categories.range(),
    "usage_log": globals.usage_log,
    "caption_list": globals.caption_list,
    "annotation_list": globals.annotation_list,
    "image_list": globals.image_list,
    "author": globals.email_address,
    "timestamp": new Date().valueOf()
  };
};

/**
 * Sets the color for the given category
 * @param {string} category The category to change
 * @param {number} categoryIndex The index of the category
 * @param {string} value The category color
 * @returns {void}
 */
TimelineStoryteller.prototype.setCategoryColor = function (category, categoryIndex, value) {
  return this._setCategoryColor(category, categoryIndex, value);
};

/**
 * Sets the playback mode
 * @param {boolean} isPlayback True if playback mode
 * @param {boolean} [addLog=true] True if the change should be logged
 * @returns {void}
 */
TimelineStoryteller.prototype.setPlaybackMode = function (isPlayback, addLog) {
  //log("Setting playback mode", isPlayback);

  var importDiv = this.importPanel.element;
  var menuDiv = selectWithParent("#menu_div");
  var optionDiv = selectWithParent("#option_div");

  // This adjusts elements offscreen by calculating their widths and moving them appropriately
  function toggleElement(element, prop, padding) {
    var offscreen = element.node()[(prop === "bottom" || prop === "top") ? "clientHeight" : "clientWidth"];
    element.style(prop, (isPlayback ? ("-" + offscreen + 5) : padding) + "px");
  }

  if (isPlayback) {
    selectWithParent("#record_scene_btn").attr("class", "img_btn_disabled");
    selectWithParent("#caption_div").style("display", "none");
    this._addImagePopup.hide();
    selectWithParent("#filter_div").style("display", "none");

    menuDiv.attr("class", "control_div onhover");
    importDiv
      .style("top", "-" + importDiv.node().clientHeight + "px")
      .attr("class", "control_div onhover");
    optionDiv.attr("class", "control_div onhover");

    d3.select(".introjs-hints").style("opacity", 0);
  } else {
    selectWithParent("#record_scene_btn").attr("class", "img_btn_enabled");
    optionDiv.attr("class", "control_div");
    importDiv.attr("class", "control_div");
    menuDiv.attr("class", "control_div");

    d3.select(".introjs-hints").style("opacity", 1);
  }
  // Set read-only mode for annotation elements in playback mode
  d3.selectAll(".annotation_control, .annotation_drag_area, .image_drag_area, .caption_drag_area")
    .style("display", isPlayback ? "none" : "");

  toggleElement(optionDiv, "top", 10);
  toggleElement(menuDiv, "left", 10);
  toggleElement(selectWithParent("#hint_div"), "top", 20);
  toggleElement(selectWithParent("#intro_div"), "top", 10);
  toggleElement(selectWithParent("#footer"), "bottom", 0);
  toggleElement(selectWithParent("#logo_div"), "top", 10);

  // Toggle a playback-mode class
  selectWithParent().classed("playback_mode", isPlayback);

  this.playback_mode = isPlayback;
  globals.playback_mode = this.playback_mode;

  if (typeof addLog === "undefined" || addLog) {
    //logEvent("playback mode " + (isPlayback ? "on" : "off"), "playback");
  }

  this.applyOptions();
};

/**
 * A utility function to get the scrollbar width
 * @returns {number} The scrollbar width
 */
function getScrollbarWidth() {
  var outer = document.createElement("div");
  outer.style.visibility = "hidden";
  outer.style.width = "100px";
  document.querySelector(".timeline_storyteller").appendChild(outer);

  var widthNoScroll = outer.offsetWidth;
  // force scrollbars
  outer.style.overflow = "scroll";

  // add innerdiv
  var inner = document.createElement("div");
  inner.style.width = "100%";
  outer.appendChild(inner);

  var widthWithScroll = inner.offsetWidth;

  // remove divs
  outer.parentNode.removeChild(outer);

  return widthNoScroll - widthWithScroll;
}

export default TimelineStoryteller;
