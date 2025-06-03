# Safari Extension Setup Guide

Since modern Safari requires extensions to be part of macOS apps, here are your options:

## Option 1: Quick Testing (Recommended for Development)

I've created a test page that simulates the extension functionality:

1. **Start the Reading Tracker app**: `npm start`
2. **Open the test page**: Open `extension-test.html` in Safari
3. **Test the features**:
   - Click "Test API Connection" to verify the app is running
   - Click "Save This Article" to test article saving
   - Click "Open Reading Library" to view saved articles

This lets you test all the core functionality without dealing with Safari's extension packaging.

## Option 2: Create Proper Safari Extension with Xcode

### Step 1: Use Safari Web Extension Converter

```bash
# Install Xcode first if you haven't already
# Then run this in Terminal:
xcrun safari-web-extension-converter safari-extension/ReadingTracker.safariextension --project-location ./ReadingTrackerExtension
```

This creates a proper Xcode project with your extension embedded.

### Step 2: Build and Install

```bash
cd ReadingTrackerExtension
open ReadingTrackerExtension.xcodeproj
```

In Xcode:
1. Select your Mac as the target
2. Click the "Run" button (▶️)
3. This builds and installs the extension
4. The extension appears in Safari's Extensions preferences

### Step 3: Enable in Safari

1. Open Safari → Preferences → Extensions
2. Find "Reading Tracker" and enable it
3. Grant necessary permissions

## Option 3: Manual Xcode Setup

1. **Create new Xcode project**:
   - File → New → Project
   - macOS → App
   - Name it "Reading Tracker Extension"

2. **Add Safari Extension target**:
   - File → New → Target
   - Safari Extension
   - Copy our extension files into the generated folder

3. **Build and run** the project

## Testing Your Setup

1. **Start the main app**: `npm start` 
2. **Verify API is running**: Check console for "Reading Tracker API server running on http://localhost:3001"
3. **Test with our test page**: Open `extension-test.html` and test all buttons
4. **Try real articles**: Visit news sites and test the extension

## Troubleshooting

**"Developer cannot be verified" error**:
- Go to System Preferences → Security & Privacy
- Click "Allow" for the Reading Tracker app

**Extension not appearing in Safari**:
- Check Safari → Preferences → Extensions
- Make sure the extension is enabled
- Restart Safari if needed

**API connection failed**:
- Ensure the main Reading Tracker app is running
- Check that port 3001 isn't blocked by firewall
- Look for error messages in the app console

## Development Workflow

For active development, I recommend:

1. Use the test page (`extension-test.html`) for quick feature testing
2. Use Xcode for actual Safari extension development
3. The main app provides the API and reading library interface
4. All data stays local in your SQLite database

The test page gives you 90% of the functionality without the Safari extension complexity!