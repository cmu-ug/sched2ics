/* global Vue, node_cal, M, fetch, moment, URLSearchParams */
// TODO: consider a better way for searching

const DEFAULT_SEMESTER = 'F2021';

let cfg = {};
let fce_hours = {};

const DISPLAY_CODE_ONLY = 0;
const DISPLAY_NAME_AND_CODE = 1;
const DISPLAY_NAME_ONLY = 2;
const DISPLAY_CODE_AND_SECTION = 3;
const DISPLAY_NAME_AND_SECTION = 4;

const DAYS = 'UMTWRFS';

function fetchFirstDays(startDate, startTime) {
  var firstDays = {};

  var dateStr = '';
  dateStr += startDate.getFullYear() + ' ' + (startDate.getMonth()+1) + ' ' + startDate.getDate();
  dateStr += ' ' + startTime;
  var baseDate = moment(dateStr, 'YYYY MM DD h:mmA');

  for (var i = 0; i < 7; i++) {
    var tempDateTwo = baseDate.toDate();
    firstDays[DAYS[tempDateTwo.getDay()]] = tempDateTwo;
    baseDate.add(1, 'days');
  }

  return firstDays;
}

function countKeys(obj) {
  var i = 0;
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      i += 1;
    }
  }
  return i;
}

function downloadString(mimeType, fileName, data) {
  var uri = 'data:' + mimeType + ',' + encodeURIComponent(data);

  var downloadLink = document.createElement('A');
  downloadLink.href = uri;
  downloadLink.download = fileName;

  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

function repeatWeeklyWithBreaks(startDate, date) {
  var a = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  var b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  var timeDiff = Math.abs(a - b);
  var diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
  if (diffDays % 7 == 0) {
    // check if the day is a break
    var myStr = date.toDateString();
    for (var i = 0; i < cfg.SEMESTER_BREAKS.length; i++) {
      if (cfg.SEMESTER_BREAKS[i].toDateString() === myStr) return false;
    }
    return true;
  } else return false;
}

(function() {
  // fetch config
  const urlParams = new URLSearchParams(window.location.search);
  const cfgSem = urlParams.get('semester') || DEFAULT_SEMESTER;
  console.log('Fetching data for', cfgSem);

  fetch('data/fce_hours.json').then(function(resp) {
    if (!resp.ok) throw new Error(resp.status);
    return resp.json();
  }).then(function (fetched_data) {
    fce_hours = fetched_data;
  }).catch(function (err) {
    M.toast({html: 'Error fetching FCE information: ' + err});
    console.error('oopsies', err);
  });

  fetch('data/'+cfgSem+'.json').then(function(resp) {
    if (!resp.ok) throw new Error(resp.status);
    return resp.json();
  }).then(function (fcfg) {
    document.title += ' - ' + fcfg["SEMESTER_NAME"];
    document.getElementById('msg').innerHTML = ('DUMMY' in fcfg) ?
        'Preview past courses in ' + fcfg["SEMESTER_NAME"] + ' here!':
        'Download a calendar containing all of your ' + fcfg["SEMESTER_NAME"] + ' courses here!';
    document.getElementById('courseInput').disabled = false;
    document.getElementById('mainApp').style.display = 'block';
    let jsonDate2Date = (a) => new Date(a[0], a[1], a[2]);

    for (var key in fcfg) {
      if (fcfg[key].constructor === Array) {
        /* we know it's an array, but it could be an array of dates, or a single date */
        if (fcfg[key][0].constructor === Array) {
          /* it's an array of dates */
          cfg[key] = [];
          for (var i = 0; i < fcfg[key].length; i++) {
            cfg[key].push(jsonDate2Date(fcfg[key][i]));
          }
        } else if (fcfg[key].length == 3) {
          /* it's just a date by itself */
          cfg[key] = jsonDate2Date(fcfg[key]);
        } else {
          throw new Error('Invalid JSON format');
        }
      } else {
        cfg[key] = fcfg[key];
      }
    }
    mainInit();
  }).catch(function (err) {
    M.toast({html: 'Error fetching app configuration: ' + err});
    document.getElementById('msg').innerHTML = 'Failed to fetch courses!';
    console.error('oopsies', err);
  });
})(this);

const SETTINGS_APP_KEY = 'USER_PREFS';
let mainInit = function() {
  // course input textbox
  var courseInput = document.getElementById('courseInput');
  var downloadBtn = document.getElementById('downloadBtn');
  var courseData;

  // init the fab
  M.FloatingActionButton.init(document.querySelectorAll('.fixed-action-btn'));

  // init modals
  M.Modal.init(document.querySelectorAll('.modal'), {
    onCloseEnd: function() {
      mainApp.updateSelection();
      settingsApp.commit();
    }
  });

  // init forms
  setTimeout(function() {
    M.FormSelect.init(document.querySelectorAll('select'));
  }, 100);

  // init visual calendar
  initializeVisualCalendars();

  // initialize the vue app
  var mainApp = new Vue({
    el: '#mainApp',
    data: {
      courses: [],
      mainCal: null
    }, methods: {
      addCourse: function(course) {
        courseInput.value = '';
        for (var i = 0; i < this.courses.length; i++) {
          if (this.courses[i].id == course) return;
        }
        console.log('adding course', course);
        var hasLectures = false;
        var hasRecitations = false;
        var firstL = null, firstR = null;
        // separate lectures and recitations
        var lectures = {}, recitations = {};
        for (var i = 0; i < courseData[course].length; i++) {
          if (courseData[course][i].section.indexOf('Lec') >= 0) {
            if (!lectures.hasOwnProperty(courseData[course][i].section)) {
              // not already in there
              lectures[courseData[course][i].section] = [];
            }
            lectures[courseData[course][i].section].push({
              days: courseData[course][i].days,
              begin: courseData[course][i].begin,
              end: courseData[course][i].end,
              room: courseData[course][i].room
            });
            hasLectures = true;
            if (!firstL) firstL = courseData[course][i].section;
          } else {
            if (!recitations.hasOwnProperty(courseData[course][i].section)) {
              // not already in there
              recitations[courseData[course][i].section] = [];
            }
            recitations[courseData[course][i].section].push({
              days: courseData[course][i].days,
              begin: courseData[course][i].begin,
              end: courseData[course][i].end,
              room: courseData[course][i].room
            });
            hasRecitations = true;
            if (!firstR) firstR = courseData[course][i].section;
          }
        }
        this.courses.push({
          id: course,
          title: courseData[course][0].title,
          lectures: lectures,
          recitations: recitations,
          hasLectures: hasLectures,
          hasRecitations: hasRecitations,
          idl: 'l' + course,
          idr: 'r' + course,
          pickl: firstL,
          pickr: firstR,
          units: courseData[course][0].units,
          fce: (course in fce_hours) ? (fce_hours[course].toFixed(2)) : '???',
        });
        this.updateSelection();
      },
      updateSelection: function() {
        // this will use node-cal to set up all of the classes, and then generate a blob to download
        this.mainCal = new node_cal.Calendar('Courses', 'Course schedule for the ' + cfg.SEMESTER_NAME + ' semester.');
        // reset visual calendars
        resetVisualCalendars();

        // loop through all courses
        for (var i = 0; i < mainApp.courses.length; i++) {
          var course = mainApp.courses[i];
          var selectedLectureTimes = course.hasLectures ? course.lectures[course.pickl] : [];
          var selectedRecitationTimes = course.hasRecitations ? course.recitations[course.pickr] : [];
          var onlyHasOneMtg = (countKeys(course.lectures) + countKeys(course.recitations)) == 1;
          onlyHasOneMtg = onlyHasOneMtg && settingsApp.settings.hideExtraneousSectionCode;

          for (var j = 0; j < selectedLectureTimes.length; j++) {
            addEventToCalendar(this.mainCal, course, 'Lecture', selectedLectureTimes[j], onlyHasOneMtg);
          }

          for (var j = 0; j < selectedRecitationTimes.length; j++) {
            addEventToCalendar(this.mainCal, course, course.pickr, selectedRecitationTimes[j], onlyHasOneMtg);
          }
        }

        // draw the visual calendar again
        redrawVisualCalendars();

        // check download btn enable
        if (mainApp.courses.length > 0) {
          if ((!(downloadBtn.classList.contains('blue'))) && (!('DUMMY' in cfg))) {
            downloadBtn.classList.remove('grey');
            downloadBtn.classList.add('blue');
            downloadBtn.classList.add('waves-effect');
          }
        } else {
          if (!(downloadBtn.classList.contains('grey'))) {
            downloadBtn.classList.add('grey');
            downloadBtn.classList.remove('blue');
            downloadBtn.classList.remove('waves-effect');
          }
        }
      }
    },
    computed: {
      unit_total: function() {
        return this.courses.reduce(function(prev, item) {
          return prev + item.units; 
        }, 0);
      },
      fce_total: function() {
        return this.courses.reduce(function(prev, item) {
          let hrs = parseFloat(item.fce);
          return prev + (isNaN(hrs) ? 0 : hrs);
        }, 0).toFixed(2);
      },
      fce_ignored: function() {
        return this.courses.reduce(function(prev, item) {
          let hrs = parseFloat(item.fce);
          return prev + (isNaN(hrs) ? 1 : 0); 
        }, 0);
      },
    }
  });

  var settingsApp = new Vue({
    el: '#settingsApp',
    data: {
      alarmsRaw: "",
      alarmsTimeout: null,
      settings: {
        alarms: [600], // 600 seconds = 10 minutes before
        period_start: cfg.SEMESTER_START,
        period_half_end: cfg.SEMESTER_HALF_END,
        period_half_start: cfg.SEMESTER_HALF_START,
        period_end: cfg.SEMESTER_END,
        hideExtraneousSectionCode: true,
        displayStyle: DISPLAY_CODE_AND_SECTION,
        socLocation: cfg.SOC_JSON,
        isDummy: 'DUMMY' in cfg,
      }
    }, methods: {
      updateRawAlarms: function() {
        if (this.alarmsTimeout) {
          clearTimeout(this.alarmsTimeout);
        }
        this.alarmsTimeout = setTimeout(function() {
          this.settings.alarms = this.alarmsRaw.split(",").map((itm) => {
            return parseInt(itm, 10);
          });
        }.bind(this), 100);
      },
      commit: function() {
        window.localStorage.setItem(SETTINGS_APP_KEY, JSON.stringify(this.settings));
      },
      load: function() {
        let ls = window.localStorage.getItem(SETTINGS_APP_KEY);
        if (!ls) return;
        try {
          ls = JSON.parse(ls);
        } catch(e) {
          return;
        }

        let permittedKeys = ['hideExtraneousSectionCode', 'displayStyle', 'alarms'];
        for (var key in this.settings) {
          if (key in ls && permittedKeys.includes(key)) {
            this.settings[key] = ls[key];
          }
        }
      }
    }
  });
  settingsApp.load();
  settingsApp.alarmsRaw = settingsApp.settings.alarms.join(",");

  var addEventToCalendar = function(calendar, courseInfo, sectionName, sectionInfo, skipSectionName) {
    var eventTitle;
    var firstDaysFull = fetchFirstDays(settingsApp.settings.period_start, sectionInfo.begin);
    var firstDaysHalf = fetchFirstDays(cfg.SEMESTER_HALF_START, sectionInfo.begin);

    /* do the padding for sectionName here since it might be blank */
    switch (settingsApp.settings.displayStyle) {
    case DISPLAY_CODE_ONLY: eventTitle = courseInfo.id; break;
    case DISPLAY_NAME_AND_CODE: eventTitle = courseInfo.id + ' - ' + courseInfo.title; break;
    case DISPLAY_NAME_ONLY: eventTitle = courseInfo.title; break;
    case DISPLAY_CODE_AND_SECTION: eventTitle = courseInfo.id + (skipSectionName ? '' : (' ' + sectionName)); break;
    case DISPLAY_NAME_AND_SECTION: eventTitle = courseInfo.title + (skipSectionName ? '' : (' ' + sectionName)); break;
    }
    if (sectionInfo.days == 'TBA') {
      /* skip things that aren't supposed to appear on the calendar */
      return;
    }
    for (var i = 0; i < sectionInfo.days.length; i++) {
      var day = sectionInfo.days[i];
      var startTime = moment(sectionInfo.begin, 'h:mmA');
      var endTime = moment(sectionInfo.end, 'h:mmA');
      var duration = endTime.diff(startTime);
      var startDate = firstDaysFull[day];
      var endDate = settingsApp.settings.period_end;
      if (sectionName.indexOf('Lecture') < 0) {
        /* probably a recitation, so check if there are numbers in here */
        var secNbr = sectionName.match(/[0-9]/);
        if (secNbr && secNbr.length == 1) {
          /* definitely a mini (there's numbers in the name) */
          if (secNbr[0] == '1' || secNbr[0] == '3') {
            /* first half, so adjust the end date */
            endDate = cfg.SEMESTER_HALF_END;
          } else {
            /* second half, so adjust the start date */
            startDate = firstDaysHalf[day];
          }
        }
      }
      console.log(`${eventTitle} on ${day} starting ${startDate} durating ${duration/60000} minutes repeating weekly until ${endDate}`);
      var baseEvent = new node_cal.CalEvent(
        eventTitle,
        startDate,
        endDate,
        settingsApp.settings.alarms,
        null,
        sectionInfo.room
      );
      calendar.addRecurringEvent(new node_cal.RepeatingCalEvent(
        baseEvent,
        duration,
        repeatWeeklyWithBreaks
      ));
      addEventToVisualCalendar(eventTitle, day, startTime, endTime);
    }
  };

  // set up the fab download button
  downloadBtn.addEventListener('click', function(e) {
    if (downloadBtn.classList.contains('grey')) {
      // cannot download
      return;
    }
    // calendar all done, time to convert to string
    var calStr = mainApp.mainCal.toICal();
    if (calStr)
      downloadString('text/calendar', 'courses.ics', calStr);
  });

  // fetch the course json
  var updateSoc = function() {
    fetch(settingsApp.settings.socLocation).then(function(resp) {
      if (!resp.ok) throw new Error(resp.status);
      return resp.json();
    }).then(function(data) {
      courseData = data;
      var courseArray = [];
      for (var courseNum in courseData) {
        courseArray.push(courseNum);
      }
      // Set up autocomplete
      autocomplete(courseInput, courseArray, mainApp.addCourse);
    }).catch(function(err) {
      M.toast({html: 'Error fetching course JSON: ' + err});
    });
  };

  updateSoc();

  // debug
  this.mainApp = mainApp;
  this.settingsApp = settingsApp;
};

/* code from https://www.w3schools.com/howto/howto_js_autocomplete.asp */
function autocomplete(inp, arr, callback) {
  /*the autocomplete function takes two arguments,
  the text field element and an array of possible autocompleted values:*/
  var currentFocus;
  /*execute a function when someone writes in the text field:*/
  inp.addEventListener('input', function(e) {
      var a, b, i, val = this.value;
      /*close any already open lists of autocompleted values*/
      closeAllLists();
      if (!val) { return false;}
      currentFocus = -1;
      /*create a DIV element that will contain the items (values):*/
      a = document.createElement('DIV');
      a.setAttribute('id', this.id + 'autocomplete-list');
      a.setAttribute('class', 'autocomplete-items');
      /*append the DIV element as a child of the autocomplete container:*/
      this.parentNode.appendChild(a);
      /*for each item in the array...*/
      for (i = 0; i < arr.length; i++) {
        /*check if the item starts with the same letters as the text field value:*/
        if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase()) {
          /*create a DIV element for each matching element:*/
          b = document.createElement('DIV');
          /*make the matching letters bold:*/
          b.innerHTML = '<strong>' + arr[i].substr(0, val.length) + '</strong>';
          b.innerHTML += arr[i].substr(val.length);
          /*insert a input field that will hold the current array item's value:*/
          b.innerHTML += '<input type="hidden" value="' + arr[i] + '">';
          /*execute a function when someone clicks on the item value (DIV element):*/
              b.addEventListener('click', function(e) {
              /*insert the value for the autocomplete text field:*/
              inp.value = this.getElementsByTagName('input')[0].value;
              /*close the list of autocompleted values,
              (or any other open lists of autocompleted values:*/
              closeAllLists();
              setTimeout(function() {callback(inp.value);}, 10);
          });
          a.appendChild(b);
        }
      }
  });
  /*execute a function presses a key on the keyboard:*/
  inp.addEventListener('keydown', function(e) {
      var x = document.getElementById(this.id + 'autocomplete-list');
      if (x) x = x.getElementsByTagName('div');
      if (e.keyCode == 40) {
        /*If the arrow DOWN key is pressed,
        increase the currentFocus variable:*/
        currentFocus++;
        /*and and make the current item more visible:*/
        addActive(x);
      } else if (e.keyCode == 38) { //up
        /*If the arrow UP key is pressed,
        decrease the currentFocus variable:*/
        currentFocus--;
        /*and and make the current item more visible:*/
        addActive(x);
      } else if (e.keyCode == 13) {
        /*If the ENTER key is pressed, prevent the form from being submitted,*/
        e.preventDefault();
        if (currentFocus > -1) {
          /*and simulate a click on the 'active' item:*/
          if (x) x[currentFocus].click();
        } else if (x && x.length == 1) {
          /*with no other options+enter = click on first*/
          x[0].click();
        }
      }
  });
  function addActive(x) {
    /*a function to classify an item as 'active':*/
    if (!x) return false;
    /*start by removing the 'active' class on all items:*/
    removeActive(x);
    if (currentFocus >= x.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (x.length - 1);
    /*add class 'autocomplete-active':*/
    x[currentFocus].classList.add('autocomplete-active');
  }
  function removeActive(x) {
    /*a function to remove the 'active' class from all autocomplete items:*/
    for (var i = 0; i < x.length; i++) {
      x[i].classList.remove('autocomplete-active');
    }
  }
  function closeAllLists(elmnt) {
    /*close all autocomplete lists in the document,
    except the one passed as an argument:*/
    var x = document.getElementsByClassName('autocomplete-items');
    for (var i = 0; i < x.length; i++) {
      if (elmnt != x[i] && elmnt != inp) {
      x[i].parentNode.removeChild(x[i]);
    }
  }
}
/*execute a function when someone clicks in the document:*/
document.addEventListener('click', function (e) {
  closeAllLists(e.target);
});
}

/* visual calendar
 * adapted from https://www.cssscript.com/day-view-calendar-vanilla-javascript/
 */
const minutesinDay = 60 * 14;
/* lol, like the pun? this is the resolution time step of conflicts */
const conflictResolution = 10;
const dayStart = '8:00AM';
function VisualCalendar(boundElem) {
  this.boundElem = boundElem;
  this.events = [];
  this.collisions = [];
  this.width = [];
  this.leftOffSet = [];
  this.containerHeight = this.boundElem.clientHeight;
  this.containerWidth = this.boundElem.clientWidth;

  this.resizeUpdate = null;
  window.addEventListener('resize', function() {
    this.containerHeight = this.boundElem.clientHeight;
    this.containerWidth = this.boundElem.clientWidth;
    if (this.resizeUpdate) clearTimeout(this.resizeUpdate);
    this.resizeUpdate = setTimeout(function() {
      this.resizeUpdate = null;
      this.layoutElements();
    }.bind(this), 100);
  }.bind(this));

  this._recomputeCollisions = function() {
    this.collisions = [];

    for (var i = 0; i < minutesinDay / conflictResolution; i ++) {
      var time = [];
      for (var j = 0; j < this.events.length; j++) {
        time.push(0);
      }
      this.collisions.push(time);
    }

    this.events.forEach((event, id) => {
      let end = event.end;
      let start = event.start;
      let order = 1;
      let timeIndex;

      while (start < end) {
        timeIndex = Math.floor(start / conflictResolution);

        while (order < this.events.length) {
          if (this.collisions[timeIndex].indexOf(order) === -1) {
            break;
          }
          order++;
        }

        this.collisions[timeIndex][id] = order;
        start = start + conflictResolution;
      }

      this.collisions[Math.floor((end-1)/conflictResolution)][id] = order;
  });
  };

  this._recomputeAttributes = function() {
    //resets storage
    this.width = [];
    this.leftOffSet = [];

    for (var i = 0; i < this.events.length; i++) {
      this.width.push(0);
      this.leftOffSet.push(0);
    }

    this.collisions.forEach((period) => {
      // number of events in that period
      let count = period.reduce((a,b) => {
        return b ? a + 1 : a;
      }, 0);

      if (count > 1) {
        period.forEach((event, id) => {
          // max number of events it is sharing a time period with determines width
          if (period[id]) {
            if (count > this.width[id]) {
              this.width[id] = count;
            }
          }

          if (period[id] && !this.leftOffSet[id]) {
            this.leftOffSet[id] = period[id];
          }
        });
      }
    });
  };

  this._createDomElement = function(event, height, top, left, units) {
    let node = document.createElement('div');
    node.className = 'event';
    node.innerHTML = "<span class='title'>" + event.label + "</span>";

    // Customized CSS to position each event
    node.style.width = (this.containerWidth/units) + 'px';
    node.style.height = height + 'px';
    node.style.top = top + 'px';
    node.style.left = left + 'px';

    this.boundElem.appendChild(node);
  };

  this.layoutElements = function() {
    this.boundElem.innerHTML = '';

    this._recomputeCollisions();
    this._recomputeAttributes();

    this.events.forEach((event, id) => {
      let height = (event.end - event.start) / minutesinDay * this.containerHeight;
      let top = event.start / minutesinDay * this.containerHeight;
      let units = this.width[id];
      if (units == 0) units = 1;
      let left = (this.containerWidth / this.width[id]) * (this.leftOffSet[id] - 1);
      if (!left || left < 0) left = 0;
      this._createDomElement(event, height, top, left, units);
    });
  };

  this.addEvent = function(label, start, end) {
    this.events.push({
      label: label,
      start: start,
      end: end
    });
  };
}

let visualCalendars = [];
let daysMapping = {};

let initializeVisualCalendars = function() {
  for (var i = 0; i < DAYS.length; i++) {
    let container = document.getElementById('events-' + DAYS[i]);
    if (container) {
      visualCalendars.push(new VisualCalendar(container));
    } else {
      visualCalendars.push(null);
    }

    daysMapping[DAYS[i]] = i;
  }
};

let resetVisualCalendars = function() {
  for (var i = 0; i < DAYS.length; i++) {
    if (visualCalendars[i]) {
      visualCalendars[i].events = [];
    }
  }

  redrawVisualCalendars();
};

let redrawVisualCalendars = function() {
  for (var i = 0; i < DAYS.length; i++) {
    if (visualCalendars[i]) {
      visualCalendars[i].layoutElements();
    }
  }
};

let addEventToVisualCalendar = function(label, day, start, end) {
  let baseTime = moment(dayStart, 'h:mmA');

  var startMinute = start.diff(baseTime) / 60000;
  var endMinute = end.diff(baseTime) / 60000;

  if (day == 'S' || day == 'U') {
    // skip saturday and sunday
    document.getElementById('vcwarn').innerHTML = 'Warning: the Visual Calendar cannot display classes on Saturday/Sunday, but they will show up correctly in a download.<br />';
    return;
  }

  let visualCalendar = visualCalendars[daysMapping[day]];
  if (visualCalendar)
    visualCalendar.addEvent(label, startMinute, endMinute);
};
