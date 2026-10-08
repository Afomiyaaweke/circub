package com.circub.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * circub Android shell - single-activity WebView over https://circub.vercel.app.
 *
 * Feature set (kept in lockstep with the web app):
 *  - same-origin routing: circub.vercel.app stays in the shell, everything
 *    else (tel:, mailto:, other hosts, intents) goes to the system;
 *  - geolocation permission bridge (the budget locator / GPS auto-fill);
 *  - file chooser bridge (ID verification, visual search uploads);
 *  - download bridge via DownloadManager (data: URLs decode to app files);
 *  - cookies persisted + flushed on pause (sessions survive restarts);
 *  - back: OnBackInvokedCallback on API 33+, onBackPressed fallback below;
 *  - deep links: https://circub.vercel.app/... opens straight into the app.
 *
 * Build constraints: compiled with ecj against the android-36 platform jar,
 * NO androidx - everything guards on Build.VERSION, minSdk 15.
 */
public class MainActivity extends Activity {

    private static final String APP_ORIGIN = "https://circub.vercel.app";
    private static final String APP_HOST = "circub.vercel.app";
    private static final int REQ_FILE_CHOOSER = 4001;
    private static final int REQ_LOCATION = 4002;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge draw behind transparent system bars (API 20+ guard).
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
            getWindow().setStatusBarColor(Color.TRANSPARENT);
        }

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSaveFormData(true);
        if (Build.VERSION.SDK_INT >= 17) {
            s.setMediaPlaybackRequiresUserGesture(false);
        }
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        }
        CookieManager.getInstance().setAcceptCookie(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // Geolocation: the site calls navigator.geolocation -> we forward to
            // the runtime permission flow on API 23+, allow outright below that.
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                if (Build.VERSION.SDK_INT >= 23) {
                    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED) {
                        callback.invoke(origin, true, false);
                        return;
                    }
                    geoCallback = callback;
                    geoOrigin = origin;
                    requestPermissions(new String[] {
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOCATION);
                } else {
                    callback.invoke(origin, true, false);
                }
            }

            // File chooser: <input type="file"> uploads (ID docs, photos).
            @Override
            public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("*/*");
                    if (params != null && params.getAcceptTypes() != null
                            && params.getAcceptTypes().length > 0
                            && params.getAcceptTypes()[0] != null
                            && params.getAcceptTypes()[0].length() > 0) {
                        pick.setType(params.getAcceptTypes()[0]);
                    }
                    startActivityForResult(
                            Intent.createChooser(pick, "Choose a file"), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.setDownloadListener(new DownloadListener() {
            public void onDownloadStart(String url, String userAgent,
                    String contentDisposition, String mimeType, long contentLength) {
                download(url, mimeType);
            }
        });

        // Back handling: predictive back on 33+, classic fallback below.
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    1000000,
                    new android.window.OnBackInvokedCallback() {
                        public void onBackInvoked() {
                            goBackOrNothing();
                        }
                    });
        }

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(startUrlFromIntent());
        }
    }

    private String startUrlFromIntent() {
        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data != null && APP_HOST.equals(data.getHost())) {
            return data.toString();
        }
        return APP_ORIGIN + "/";
    }

    /** Same-origin stays in the shell; everything else goes to the system. */
    private boolean handleUrl(String url) {
        if (url == null) {
            return false;
        }
        if (url.startsWith(APP_ORIGIN) || url.startsWith("about:")
                || url.startsWith("blob:") || url.startsWith("data:")) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            // nothing can open it - swallow, stay in the app
        }
        return true;
    }

    private void goBackOrNothing() {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null && web.canGoBack()) {
                    web.goBack();
                } else {
                    // matches classic onBackPressed semantics
                    if (Build.VERSION.SDK_INT >= 21) {
                        finishAndRemoveTask();
                    } else {
                        finish();
                    }
                }
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT < 33 && web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /** Downloads via DownloadManager; data: URLs decode into app-private files. */
    private void download(String url, String mimeType) {
        try {
            if (url.startsWith("data:")) {
                int comma = url.indexOf(',');
                if (comma < 0) {
                    return;
                }
                String meta = url.substring(5, comma);
                boolean base64 = meta.endsWith(";base64");
                byte[] bytes = base64
                        ? Base64.decode(url.substring(comma + 1), Base64.DEFAULT)
                        : Uri.decode(url.substring(comma + 1)).getBytes("UTF-8");
                File dir = new File(getExternalFilesDir(null), "Download");
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                String ext = mimeType != null && mimeType.contains("/")
                        ? "." + mimeType.substring(mimeType.indexOf('/') + 1).split("[;+]")[0]
                        : ".bin";
                final File out = new File(dir, "circub-" + System.currentTimeMillis() + ext);
                OutputStream os = new FileOutputStream(out);
                os.write(bytes);
                os.close();
                toast("Saved " + out.getName());
                return;
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT < 29) {
                // app-private dir needs no permission; DownloadManager's public
                // dir needs WRITE_EXTERNAL_STORAGE only below API 29
                req.setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS, guessName(url));
            }
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(req);
                toast("Downloading" + (guessName(url).length() > 0 ? " " + guessName(url) : ""));
            }
        } catch (Exception e) {
            toast("Download failed");
        }
    }

    private String guessName(String url) {
        try {
            String path = Uri.parse(url).getLastPathSegment();
            if (path == null) {
                return "circub-download";
            }
            path = path.substring(path.lastIndexOf('/') + 1);
            return path.length() > 0 ? path : "circub-download";
        } catch (Exception e) {
            return "circub-download";
        }
    }

    private void toast(final String msg) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER && fileCallback != null) {
            fileCallback.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
            int[] grantResults) {
        if (requestCode == REQ_LOCATION && geoCallback != null) {
            boolean allow = grantResults != null && grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            geoCallback.invoke(geoOrigin, allow, false);
            geoCallback = null;
            geoOrigin = null;
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // persist the web session cookies before anything can kill us
        if (Build.VERSION.SDK_INT >= 21) {
            CookieManager.getInstance().flush();
        }
        if (web != null) {
            web.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) {
            web.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }
}
