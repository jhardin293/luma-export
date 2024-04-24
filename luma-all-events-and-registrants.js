import fetch from "node-fetch";
import fs from "fs";
import csv from "csv-parser";
import { Parser } from "json2csv";
import stream from "stream";
import dotenv from "dotenv";
import cliProgress from "cli-progress";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

function ensureDirectoryExistence(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const date = new Date();
const formattedDate = `${
  date.getMonth() + 1
}-${date.getDate()}-${date.getFullYear()}`;
const dateStamp = `${formattedDate}`;

const reqHeaders = {
  cookie: `luma.auth-session-key=${process.env.AUTH_KEY}`,
};

let allEvents = []; // Initialize an array to hold all events

function fetchFutureEvents(cursor = null) {
  // Check for the existence of the 'exported' directory at the start
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  ensureDirectoryExistence(path.join(__dirname, "exported"));
  let url = "https://api.lu.ma/home/get-events";
  if (cursor) {
    url += `?pagination_cursor=${cursor}`; // Append cursor if present
  }

  fetch(url, {
    body: null,
    method: "GET",
    headers: reqHeaders,
  })
    .then((response) => response.json())
    .then(async (data) => {
      allEvents = allEvents.concat(data.entries); // Accumulate events

      if (data.has_more && data.next_cursor) {
        fetchFutureEvents(data.next_cursor); // Recursively fetch next set of events
      } else {
        // Fetch guests for each event
        allEvents = allEvents.map((event) => {
          return {
            event: {
              ...event.event,
              event_url: `https://lu.ma/${event.event.url}`,
            },
          };
        });
        fetchGuestsForEvents(allEvents);
        // Export all events to CSV
        exportEventsToCSV(allEvents);
      }
    })
    .catch((error) => {
      console.error("Error fetching events:", error);
    });
}

function fetchPastEvents(cursor = null) {
  // Check for the existence of the 'exported' directory at the start
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  ensureDirectoryExistence(path.join(__dirname, "exported"));
  let url = "https://api.lu.ma/home/get-events?period=past";
  if (cursor) {
    url += `&pagination_cursor=${cursor}`; // Append cursor if present
  }

  fetch(url, {
    body: null,
    method: "GET",
    headers: reqHeaders,
  })
    .then((response) => response.json())
    .then(async (data) => {
      allEvents = allEvents.concat(data.entries); // Accumulate events

      if (data.has_more && data.next_cursor) {
        fetchPastEvents(data.next_cursor); // Recursively fetch next set of events
      } else {
        // Fetch guests for each event
        allEvents = allEvents
          .filter(
            (event) => new Date(event.event.start_at) > new Date("2024-04-20")
          )
          .map((event) => {
            return {
              event: {
                ...event.event,
                event_url: `https://lu.ma/${event.event.url}`,
              },
            };
          });

        fetchFutureEvents();
      }
    })
    .catch((error) => {
      console.error("Error fetching events:", error);
    });
}

function exportEventsToCSV(events) {
  const eventsToExport = events.map((event) => event.event); // Extracting the 'event' object from each item in the events array
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(eventsToExport);

  fs.writeFile(`./exported/events-${dateStamp}.csv`, csv, function (err) {
    if (err) {
      console.log(
        "Some error occurred - file either not saved or corrupted file saved."
      );
    }
  });
}

async function fetchGuestsForEvents(events) {
  let allGuests = [];
  // Create a new progress bar instance and use shades_classic style
  const progressBar = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic
  );
  console.log("Fetching guests for all events...");
  progressBar.start(events.length, 0);

  for (let i = 0; i < events.length; i++) {
    const guests = await fetchGuests({
      eventApiId: events[i].event.api_id,
      eventName: events[i].event.name,
      eventURL: events[i].event.event_url,
    });
    // Update the progress bar for each event processed
    progressBar.update(i + 1);
    allGuests = allGuests.concat(guests);
  }

  // Stop the progress bar when all events have been processed
  progressBar.stop();
  console.log("Total events:", allEvents.length);
  console.log("Total registrations:", allGuests.length);
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(allGuests);

  fs.writeFile(
    `./exported/registrations-${dateStamp}.csv`,
    csv,
    function (err) {
      if (err) {
        console.log(
          "Some error occurred - file either not saved or corrupted file saved."
        );
      }
    }
  );

  const dedupedGuests = allGuests.reduce((acc, current) => {
    const x = acc.find((item) => item.email === current.email);
    if (!x) {
      return acc.concat([current]);
    } else {
      return acc;
    }
  }, []);
  console.log("Total guests with unique emails:", dedupedGuests.length);

  const dedupedCsv = json2csvParser.parse(dedupedGuests);

  fs.writeFile(
    `./exported/unique-guests-${dateStamp}.csv`,
    dedupedCsv,
    function (err) {
      if (err) {
        console.log(
          "Some error occurred - file either not saved or corrupted file saved."
        );
      }
    }
  );
}

async function fetchGuests({ eventApiId, eventName, eventURL }) {
  const url = `https://api.lu.ma/event/admin/download-guests-csv?event_api_id=${eventApiId}`;
  try {
    const response = await fetch(url, {
      body: null,
      method: "GET",
      headers: reqHeaders,
    });
    const data = await response.text();
    // Assuming the data is CSV, parse it here and return the parsed object
    // This part needs to be implemented based on the actual data format

    const results = [];
    const csvStream = csv();
    const dataStream = new stream.Readable({
      read() {},
    });
    dataStream.push(data);
    dataStream.push(null); // indicates the end of the stream

    return new Promise((resolve, reject) => {
      dataStream
        .pipe(csvStream)
        .on("data", (row) => {
          // Add eventName and eventURL to each row before pushing to results
          row.event_name = eventName;
          row.event_url = eventURL;
          results.push(row);
        })
        .on("end", () => {
          resolve(results);
        })
        .on("error", reject);
    });
  } catch (error) {
    console.error("Error fetching guests for event:", eventApiId, error);
    return [];
  }
}

function init() {
  fetchPastEvents();
}

init();

// fetchEvents(); // Initial call to start fetching events
