# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Display literals, hand-written (plan 01-03, Pitfall 1; canonical
# single-word form pinned by NAME-01 in 08-01). The product name here is
# `PowerBrowser`, composed with the variant suffix where one is declared.
-brand-shorter-name = PowerBrowser
-brand-short-name = PowerBrowser
-brand-shortcut-name = PowerBrowser
-brand-full-name = PowerBrowser Dev
# This brand name can be used in messages where the product name needs to
# remain unchanged across different versions (Nightly, Beta, etc.). Kept at
# Firefox (not Power Browser) per D-78: a small set of "requires Firefox"
# compatibility strings interpolate this term, and byte-identical UA/product
# naming is the same rationale D-78 already applied to the User-Agent.
-brand-product-name = Firefox
# The DISPLAY-side vendor (D-09 as amended). The machine-side vendor is the
# space-free `Deocracy` in patches/010, because MOZ_APP_VENDOR is lowercased into
# the profile path with no space stripping.
-vendor-short-name = Deocracy
trademarkInfo = { " " }
