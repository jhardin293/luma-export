# Luma Export Script

## Disclaimer

This script does not use Luma's official APIs and is subject to change. It only displays data that an authenticated user has permission to access.

## Instructions

### Setup

1. Create a `.env` file in the root directory with your authentication key. For example:
   ```
   AUTH_KEY=usr-XXXXXX
   ```
2. Install the necessary dependencies by running:
   ```
   npm install
   ```

### Running the Script

1. Start the script with the following command:
   ```
   npm start
   ```
2. After the script runs, check the `/exported` folder for the output files.

## Output

The script exports 3 CSV files for a given host:

- `events.csv`: Contains all events.
- `registrations.csv`: Contains all registrations.
- `unique-guests.csv`: Contains all guests with unique emails.
