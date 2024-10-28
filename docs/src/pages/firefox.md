# Firefox browser

There are two ways to work on extensions in Firefox.

The **quick way** is to load the extension temporarely for the
duration of the current session. This has to be repeated every time
Firefox is started, all data from the previous session is **lost**.

A **persistent installation** is better suited for the development work
of QFeeds. The steps for that are:


## Firefox Developer Edition

To be able to work with unsigned extension we need Firefox Developer Edition

* **Download**:
   [mozilla.org/en-US/firefox/developer/](https://www.mozilla.org/en-US/firefox/developer/)

* **Untar** into a local folder:
  ```
  mkdir -p ~/.local/bin
  cd ~/.local/bin
  tar -xvf ~/Downloads/firefox-60.0b3.tar.bz2
  ```

* Start from that folder, this will also **create the profile upon
first start**
  ```
  cd ~/.local/bin/firefox
  ./firefox
  ```

* **Enable usigned** extensions

  * Enter URL `about:config`
  * search for `xpinstall.signatures.required`
  * Toggle it to `false`

* Exit Firefox

* **Find** the profile folder
  ```
  $ cd ~/.mozilla/firefox/
  $ find . -name \*dev-edition\*
  ./l062qyl2.dev-edition-default

  $ cd l062qyl2.dev-edition-default/extensions/
  ```

* Create **a pointer file** here, it should look like this:
  ```
  $ cat \{2df366ca-28d2-11e8-9c70-b7b0d99bd061\}
  /home/peterm/work/qfeeds/firefox-qfeeds/
  ```

  **Important** considerations

  Use full path to home folder, not `~`

  * The name of the pointer file **matches** the field `id` from _manifest.json_

  * The trailing slash is important

  * This **pointer file** is a left-over technique from the time of the
  now **deprecated** XUL-format extensions. It is described here:
  [Setting up extension development
  environment](https://developer.mozilla.org/en-US/docs/Archive/Add-ons/Setting_up_extension_development_environment)
  (mozilla.org), see section "Firefox extension proxy file"

* Restart Firefox Developer Edition

* **Activate the extension** from page `about:addons`. Toggle the
  enable/disable switch-box button for extension QFeeds.

* Once **the setup of devel version is done** Firefox Developer Edition
  can be started conveniently with:
  ```
  $ (cd ~/.local/bin/firefox; ./firefox&)
  ```

* To **reload the extension** after edits, Ctrl+R

* To **reload the extension** after edits of `manifest.json`, restart
  Firefox Developer Edition

* To be able to **navigate the source files** while in the Debugger set
  the option *Enable browser and add-on debugging toolboxes* to
  ON. Restart the browser.

## Debug background.js

* Navigate to the debugger via
  `about:debugging#/runtime/this-firefox`, click button *Inspect* for
  QFeeds -- this is the **only way** to debug `backgrund.js`

* Use the log filter, to isolate the messages type *background*

* To activate edits of `background.js`, go to `about:addons` and
  disable and enable the extension while the debugger window is closed
