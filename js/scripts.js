/* global Vue, node_cal, M, fetch, moment, URLSearchParams */
// TODO: consider a better way for searching

const DEFAULT_SEMESTER = 'F2020';

let cfg = {};

const DISPLAY_CODE_ONLY = 0;
const DISPLAY_NAME_AND_CODE = 1;
const DISPLAY_NAME_ONLY = 2;
const DISPLAY_CODE_AND_SECTION = 3;
const DISPLAY_NAME_AND_SECTION = 4;

function fetchFirstDays(startDate, startTime) {
  var firstDays = {};
  var days = 'UMTWRFS';
  var dateStr = '';
  dateStr += startDate.getFullYear() + ' ' + (startDate.getMonth()+1) + ' ' + startDate.getDate();
  dateStr += ' ' + startTime;
  var baseDate = moment(dateStr, 'YYYY MM DD h:mmA');

  for (var i = 0; i < 7; i++) {
    var tempDateTwo = baseDate.toDate();
    firstDays[days[tempDateTwo.getDay()]] = tempDateTwo;
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

  fetch('data/'+cfgSem+'.json').then(function(resp) {
    if (!resp.ok) throw new Error(resp.status);
    return resp.json();
  }).then(function (fcfg) {
    document.getElementById('msg').innerHTML = 'Download a calendar containing all of your ' + fcfg["SEMESTER_NAME"] + ' courses here!';
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

let mainInit = function() {
  // course input textbox
  var courseInput = document.getElementById('courseInput');
  var downloadBtn = document.getElementById('downloadBtn');
  var courseData;

  // init the fab
  M.FloatingActionButton.init(document.querySelectorAll('.fixed-action-btn'));

  // init modals
  M.Modal.init(document.querySelectorAll('.modal'));

  // init forms
  setTimeout(function() {
    M.FormSelect.init(document.querySelectorAll('select'));
  }, 100);

  // initialize the vue app
  var mainApp = new Vue({
    el: '#mainApp',
    data: {
      courses: []
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
          units: courseData[course][0].units
        });
      }
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
        socLocation: cfg.SOC_JSON
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
      }
    }
  });
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
          if (secNbr[0] == '1') {
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
    }
  };

  // set up the fab download button
  downloadBtn.addEventListener('click', function(e) {
    if (mainApp.courses.length == 0) return;
    // this will use node-cal to set up all of the classes, and then generate a blob to download
    var mainCal = new node_cal.Calendar('Courses', 'Course schedule for the ' + cfg.SEMESTER_NAME + ' semester.');

    // loop through all courses
    for (var i = 0; i < mainApp.courses.length; i++) {
      var course = mainApp.courses[i];
      var selectedLectureTimes = course.hasLectures ? course.lectures[course.pickl] : [];
      var selectedRecitationTimes = course.hasRecitations ? course.recitations[course.pickr] : [];
      var onlyHasOneMtg = (countKeys(course.lectures) + countKeys(course.recitations)) == 1;
      onlyHasOneMtg = onlyHasOneMtg && settingsApp.settings.hideExtraneousSectionCode;

      for (var j = 0; j < selectedLectureTimes.length; j++) {
        addEventToCalendar(mainCal, course, 'Lecture', selectedLectureTimes[j], onlyHasOneMtg);
      }

      for (var j = 0; j < selectedRecitationTimes.length; j++) {
        addEventToCalendar(mainCal, course, course.pickr, selectedRecitationTimes[j], onlyHasOneMtg);
      }
    }

    // calendar all done, time to convert to string
    var calStr = mainCal.toICal();
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
