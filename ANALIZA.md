# Analiza funksionale e Klor Poker

Platforma është një prototip i luajtshëm Texas Hold’em me kredit virtual. Baza e lojës ekzistonte, por hyrja e përbashkët në tavolinë dhe mungesa e afateve e bënin rrjedhën të paqartë. Tani hyrja ndahet sipas rolit.

## Hierarkia

| Roli | Paneli dhe përgjegjësitë |
| --- | --- |
| Center / Qendra | Krijon administratorë, shpërndan/rikthen kredit, krijon tavolina, cakton rake, shikon regjistrin global. |
| Admin | Krijon agjentë, menaxhon kreditin e tyre dhe shikon transfertat e veta. |
| Agent | Krijon lojtarë, shpërndan/rikthen kreditin e portofolit dhe shikon transfertat e veta. |
| Lojtari | Hyn në lobby, zgjedh tavolinën dhe vendin, vendos buy-in, luan dhe rikthen çipat në portofol kur largohet. |

Lejet kontrollohen në server. Operatorët nuk luajnë nga llogaria e menaxhimit. Një operator nuk transferon kredit drejtpërdrejt te një llogari jashtë vartësve të vet direkt.

## Rrjedha e lojtarit

1. Login → lobby me blinds, vende të zëna dhe kufij buy-in.
2. Portofoli zero → tavolina nuk hapet; kërkohet kredit nga agjenti.
3. Zgjedhja e vendit dhe buy-in zbresin kredit nga portofoli dhe vendosin çipa në tavolinë. Lejohet vetëm një tavolinë për lojtar.
4. Dy lojtarë me çipa të mjaftueshëm nisin dorën. Serveri drejton blinds, radhën, board, all-in, side pots dhe shpërndarjen.
5. Çdo veprim ka 30 sekonda. Pas afatit serveri bën auto-fold. Dy duar radhazi pa veprim shkaktojnë largim përpara dorës së tretë, me kthim të çipave në portofol. Veprimi manual e zeron numërimin.
6. Pas përfundimit të dorës, rezultati, letrat fituese dhe animimet shfaqen për tetë sekonda. Nëse lojtari ka zero çipa ose më pak se big blind, më pas hapet kërkesa për riblerje me 30 sekonda të plota. Afati ruhet në server dhe vazhdon edhe pa shfletuesin.
7. Riblerja përdor portofolin. Nëse është bosh, agjenti duhet ta furnizojë brenda afatit. Pa riblerje lojtari largohet dhe çipat e mbetur kthehen në portofol.

Portofoli dhe çipat në tavolinë janë dy gjendje të ndryshme. Portofoli zero gjatë lojës nuk largon një lojtar që ka çipa në tavolinë. All-in me zero çipa pret përfundimin e dorës sepse lojtari mund të fitojë pot-in.

## Saktësia dhe qëndrueshmëria

Janë shtuar afatet autoritative, lojërat automatike, riblerja, bllokimi i hyrjes pa kredit, privatësia e letrave pas fold, emrat e fituesve, kufizimi i rihapjes së raise pas një all-in të paplotë dhe kthimi i basteve të pakonkurruara pa rake. Rake kreditohet te Qendra. Snapshot-i ruan portofolin dhe çipat/kontributet; pas rinisjes dora anulohet dhe shumat e ruajtura kthehen në portofol.

## Çfarë mbetet

Kjo nuk është ende një platformë e përfunduar për para reale. Mungojnë databaza transaksionale dhe regjistri kontabël i pandryshueshëm, rikthimi i plotë i dorës pas crash, verifikimi i pavarur i motorit, rregulli i plotë për rihapjen nga disa all-in të vogla radhazi, shpërndarja e odd chips sipas pozicionit ndaj dealer-it, politika e missed blinds/sit-out, mbrojtja ndaj bashkëpunimit dhe abuzimit, menaxhimi i sesioneve për përdorim publik, pagesat dhe proceset përkatëse të operatorit.

Testet automatike mbulojnë vlerësimin e duarve, side pots, rake, lejet e hierarkisë, hyrjen pa kredit, riblerjen, ruajtjen e çipave dhe largimin pas afatit. Pamja në shfletues duhet të verifikohet gjithashtu në pajisjet ku do të përdoret.


## Përmirësimi i tavolinës dhe animimeve

Problemet e pamjes ishin letrat e vogla, mungesa e çipave fizikë, mungesa e një numërimi të vazhdueshëm dhe rindërtimi i elementeve në çdo poll. Gjithashtu rezultati nuk përmbante kombinimin e saktë me pesë letra.

Tavolina tani ruan elementet e pandryshuara, pozicionon lojtarin lokal në fund dhe paraqet letra më të mëdha, të vendosura drejt dhe në qendër mbi avatarin e tij. Çipat kanë prerje, ngjyra, buzë dhe shtresa; vlera numerike mbetet burimi i saktë i shumës. Serveri lëshon ngjarje publike me numër rendor për deal, blinds, bets, check, fold, streets dhe payout. Klienti konsumon secilën vetëm një herë; hyrja në mes të një dore nuk riprodhon historikun e animimeve.

Bastet lëvizin nga avatari drejt pot-it dhe fitimi nga pot-i drejt marrësit. Kartat shpërndahen me animim, ndërsa letrat e kundërshtarëve mbeten të fshehta sipas rregullave të serverit. Në showdown serveri llogarit pesë letrat konkrete të fituesit. Vetëm këto theksohen me glow; letrat e tjera zbehen. Për disa fitues ose side pots mund të zgjidhet fituesi për të parë kombinimin e tij. Kthimi i një kontributi të pakonkurruar nuk etiketohet si fitore e pot-it.

Unaza SVG llogaritet nga afati i serverit, vazhdon ndërmjet poll-eve dhe ndryshon ngjyrë në 10 dhe 5 sekondat e fundit. Kontrollet përfshijnë All-in, Min, gjysmën e pot-it, Pot dhe Max. Shuma që lojtari po redakton nuk mbishkruhet nga polling. Dërgimi i dyfishtë i veprimit bllokohet gjatë kërkesës. Janë shtuar statusi i lidhjes, tinguj opsionalë, aktivizimi/ndalimi i animimeve, ekrani i plotë, historia e palosshme dhe afati i dorës së ardhshme. Pauza ndërmjet duarve është tetë sekonda për të lexuar rezultatin.

Verifikimi: testet e motorit dhe të të dhënave vizuale, si dhe një skenar real në Chrome për 1440px, 390px dhe 320px. Skenari i shfletuesit përdor të dhëna të izoluara dhe nuk prek llogaritë ose balancat reale. Pamjet ruhen te `artifacts/`. Transporti mbetet polling çdo 1.3 sekonda; ngjarjet ruajnë veprimet ndërmjet kërkesave, por nuk japin vonesën e ulët të WebSocket. Zbatimi i plotë i WebSocket dhe rikthimi i dorës pas restart mbeten punë të veçanta.


### Përshtatja sipas referencës së tavolinës

Vendet e lira janë butona rrethorë JOIN që hapin formularin e buy-in. Çdo lojtar ka vetëm dy letra të ndara, në të njëjtin rresht dhe të qendruara mbi avatarin. Një komponent i përbashkët përcakton madhësinë dhe hapësirën sipas ekranit. Pakoja dekorative dhe kopja e dytë e dorës janë hequr. Shiriti i veprimeve përdor tre butona kryesorë: Fold, Check ose Call sipas shumës për t'u ndjekur dhe Raise. Shuma, slider-i dhe butonat −/+ janë në të djathtë në desktop dhe poshtë në telefon. All-in dhe madhësitë e paracaktuara qëndrojnë në një rresht dytësor. Nuk shfaqet një kopje e dytë e letrave te kontrollet.


### Organizimi brenda ekranit dhe pasiviteti

Tavolina përdor lartësinë e ekranit, me shirit të sipërm, skenë responsive që ndryshon madhësinë e felt-it pa zvogëluar letrat ose tekstet, kontrolle kompakte dhe shirit ndihmës poshtë. Historiku hapet si panel me scroll brenda vetes. Simbolet qendrore të letrave janë SVG të qendruara në të dy akset; pamja e letrave është modernizuar. Pozicionet e animimeve përshtaten me shkallëzimin e skenës.

Serveri numëron auto-fold sipas dorës, jo sipas numrit të kërkesave ose poll-eve. Pas dy duarve pa veprim, lojtari hiqet para blinds të dorës së tretë. Çipat e mbetur kthehen të plotë dhe dalja regjistrohet me arsyen INACTIVE. Një veprim manual i vlefshëm e zeron numëruesin. Lojtari merr paralajmërim dhe kthehet në lobby pas largimit.


### Lexueshmëria responsive

U hoq plotësisht transformimi scale i skenës dhe matja automatike që zvogëlonte të gjithë tavolinën. Tavolina shtrihet në gjerësinë e ekranit, ndërsa letrat personale kanë 68 px gjerësi në PC dhe 63 px në telefon, me numra dhe simbole më të mëdha, avatarët dhe emrat ruajnë madhësitë e tyre dhe butonat kryesorë kanë lartësi të paktën 44 px. Në ekrane të ulëta lejohet scroll vertikal në vend të teksteve dhe letrave shumë të vogla. Rreshtat anësorë të lojtarëve kanë ndarje më të madhe vertikale që emrat të mos mbulojnë letrat e një lojtari tjetër. Në telefon, vendet anësore shtrihen në skajet e tavolinës për të liruar letrat qendrore.


### Forma e qëndrueshme e tavolinës

U hoq lartësia e pavarur nga gjerësia që deformonte felt-in. Tani gjerësia dhe lartësia llogariten së bashku me raport 2.3:1 në desktop dhe 0.9:1 në telefon vertikal. Skajet janë të rrumbullakosura me segmente të drejta, në vend të elipsit të zgjatur. ResizeObserver mat vetëm hapësirën e skenës dhe ndryshon dimensionet e felt-it; nuk përdoret scale për letrat, emrat ose butonat. Në ekranet shumë të ulëta ruhet madhësia e lexueshme me scroll vertikal.


### Korrigjimi i tavolinës bosh

Llogaritja e mëparshme ruante raportin e felt-it por lejonte që lartësia e vogël e dritares ta zvogëlonte nën hapësirën e nevojshme për gjashtë vende. Tani skena ka një minimum të llogaritur nga gjerësia e disponueshme dhe madhësia e lexueshme e tavolinës: deri në 900 px minimum në desktop, i kufizuar nga gjerësia e dritares; në telefon përdoret gjerësia e disponueshme. Faqja zgjatet vertikalisht kur mungon lartësia. Testi real në Chrome kontrollon tavolinën bosh me gjashtë JOIN dhe verifikon që asnjë çift butonash nuk mbivendoset në shtatë madhësi dritaresh, përfshirë 510×300 dhe 844×390. Pamjet e verifikimit janë `artifacts/table-empty-desktop.png`, `artifacts/table-empty-short.png` dhe `artifacts/table-empty-mobile.png`.


### Simbolet dhe glow i fituesit

Të katër simbolet përdorin të njëjtat forma SVG në qendër dhe në cepat e letrës. Numri/shkronja dhe simboli i cepit janë brenda një koordinimi SVG fiks, për të shmangur ndryshimet e fonteve dhe mbivendosjen me simbolin qendror. Shenja trefletëshe përdor tre rrathë simetrikë me bisht të veçantë. Ngjyrat janë të kuqe për zemër/karo dhe të errëta për spathi/trefletësh. Glow dhe bordura e pesë letrave fituese janë jeshile; letrat që nuk formojnë kombinimin e zgjedhur mbeten të zbehura. Testet kontrollojnë të 52 letrat, ndërsa skenari në Chrome verifikon edhe ngjyrën reale të bordurës dhe hijes së fituesit.


### Rezultati para kërkesës për kredit

Serveri cakton `rebuyAvailableAt` tetë sekonda pas rezultatit dhe afatin `rebuyDeadline` tridhjetë sekonda pas këtij momenti. Klienti nuk hap dialogun para kohës së serverit, kështu që dritarja nuk mbulon menjëherë letrat dhe fituesin. Testi në Chrome kontrollon që dialogu është i mbyllur gjatë shfaqjes së rezultatit dhe hapet më pas. Testi i integrimit kontrollon afatin e plotë të kreditit dhe që lojtari mbetet në vend deri në përfundimin e tij.

### Saktësia dhe përditësimi live i rake

Rake përllogaritet mbi kontributet e konkurruara, me rrumbullakim kumulativ në cent dhe kufi për të gjithë dorën. Side pots nuk shkaktojnë më humbje centësh nga rrumbullakime të veçuara. Ruajtja dhe kreditimi kryhen në fund të dorës; panelet e stafit marrin menjëherë snapshot-in e ri me një stream SSE të autentikuar dhe rilidhje automatike. Lojtarët nuk kanë akses në stream. Regjistrimet historike pa ndarje nuk u ndryshuan.


## Përditësimi i madh: rregullat e Texas Hold'em (tetor 2026)

Motori i lojës u nda nga `server.js` në `game.js`, që të testohet më vete. Rregullat e reja:

| Rregulli | Para | Tani |
| --- | --- | --- |
| Afati 30 s | Fold gjithmonë | **Check** nëse nuk ka bast për të ndjekur, përndryshe fold |
| Çipi tek në barazim | Vendi me numrin më të vogël | Fituesi i parë **majtas dealer-it** |
| Disa all-in të paplotë | Nuk e rihapnin kurrë ngritjen | Rihapin ngritjen kur bashkë arrijnë një ngritje të plotë (TDA) |
| Showdown | Të gjitha letrat hapeshin | Tregon i pari agresori i river-it (ose majtas dealer-it); dora humbëse bën **muck**; me all-in hapen të gjitha |
| Largimi gjatë dorës | I ndaluar | Bën **fold** menjëherë; çipat kthehen në portofol kur mbaron dora |
| Hyrja gjatë lojës | Vetëm ndërmjet duarve | Lejohet; lojtari merr letra nga dora e ardhshme dhe paguan një **big blind** për të hyrë (përveç kur është në SB/BB). Butoni nuk kalon te lojtari që duhet të paguajë |
| Pushimi (sit-out) | Mungonte | Butoni **Pushim**; nuk merr letra; kur kthehet paguan big blind; largohet pas 10 min pushimi |
| Para të vdekura | Gabim "No winner" kur dikush bënte fold jashtë radhës | Shkojnë te lojtarët që janë ende në dorë |
| Bet / Raise | Gjithmonë "RAISE" | **BET** për bastin e parë të raundit, **RAISE** më pas; mesazhet e minimumit e dallojnë |
| Call pa shumë | Regjistrohej "call 0" | Trajtohet si check |

Ndërfaqja e re: shenjat **SB/BB** pranë lojtarëve, **side pots** në kohë reale brenda pot-it, përshkrimi i dorës ("Full House K mbi 7", "Çift A në dorë"), veprimet paraprake (**Check/Fold**, **Check**, **Call çdo bast**), butonat **Pushim** dhe **Trego letrat** pas dorës, dialogu **Rregullat** me renditjen e duarve (nga tavolina dhe lobby), etiketat PRET/PUSHIM/LARGOHET dhe historiku i dorës në shqip me letrat e board-it, showdown, muck dhe çdo pot.

Testet: `rules.test.js` (13 skenarë të rregullave me kuvertë të kontrolluar), teste shtesë për kicker, barazime dhe para të vdekura te `poker.test.js`, si dhe për përshkrimet te `table-visuals.test.js`. Gjithsej 40 teste kalojnë.

Ende mungojnë: missed blinds të plota dhe dead button, time bank, turne (SNG/MTT), chat, rikthimi i dorës pas restart, WebSocket.


## Dizajni i ri, all-in me radhë dhe animimet (tetor 2026)

**All-in sipas rregullave.** Kur nuk mbetet më asnjë vendim për të marrë, serveri i hap letrat e lojtarëve në tavolinë dhe e shpërndan board-in me radhë: flop (3), pauzë, turn (1), pauzë, river (1), pauzë, dhe vetëm pastaj shpall fituesin. Afatet janë në server (`RUNOUT_STEP_MS`), kështu që të gjithë lojtarët e shohin njësoj. Gjatë kësaj kohe shfaqet shenja "ALL-IN" dhe klienti rifreskohet më shpesh.

**Pot-et.** Nivelet e kontributeve me të njëjtët pretendentë bashkohen në një pot të vetëm. Më parë blind-i i një lojtari që bëri fold krijonte një "side pot" të rremë.

**Dizajn i ri i tavolinës.** `public/table.css` u rishkrua nga zero, ndërsa nga `style.css` u hoqën vetëm rregullat e vjetra të tavolinës. Rezultati:
- Tavolinë me buzë lëkure dhe felt jeshil; emrat e lojtarëve në pllaka xhami.
- Butoni i dealer-it lëviz me animim nga një lojtar te tjetri.
- Fituesi shpallet mbi tavolinë.
- Paneli i veprimeve ka lartësi fikse dhe qëndron gjithmonë i dukshëm, menjëherë poshtë letrave të tua:
  - madhësitë e bastit dhe slider-i në një rresht;
  - butonat e mëdhenj Fold / Check-Call / Raise poshtë tyre;
  - kur nuk është radha jote, aty dalin veprimet paraprake.
- Përshtatja sipas ekranit:
  - Telefon dhe tablet vertikal: tavolinë vertikale.
  - Telefon horizontal: butonat në një kolonë djathtas, si në aplikacionet e pokerit.
- Mbivendosjet u kontrolluan me matje automatike në 360×640, 375×812, 390×844, 412×915, 667×375, 844×390, 768×1024, 1024×768, 1366×768 dhe 1920×1080. Mbeten vetëm disa piksel në telefonin më të vogël, në raste të rralla, p.sh. pot i ndarë me dy fitues.

**Animimet.**
- Basti rrëshqet para lojtarit, ndërsa në fund të raundit bastet mblidhen në pot.
- Letrat e all-in kthehen me rrotullim; letrat e board-it hapen me "flip".
- Në fund, çipat rrëshqasin nga pot-i te fituesi, pot pas pot. Numri i çipave të fituesit rritet kur çipat mbërrijnë dhe del "+shuma".
- Animimet janë të ndezura si parazgjedhje edhe kur sistemi kërkon "reduce motion". Fiken nga menyja ⋯.

**Shtesa për lojë reale.**
- Madhësi standarde basti: 2.5×/3×/4× BB para flop-it; ⅓, ½, ¾ dhe Pot pas tij.
- Shkurtore tastiere: F, C, R.
- Tingull kur vjen radha jote.
- Time bank: 30 s në fillim, +2 s për çdo dorë, deri në 60 s, me nga 20 s për përdorim.
- Chat i tavolinës me emoji të shpejtë, numër mesazhesh të palexuara dhe kufizim shpejtësie.
- Historiku dhe chat-i hapen në një panel anësor.

Testet: 44 teste kalojnë. Të rejat mbulojnë hapjen me radhë të board-it, time bank-un, chat-in, bashkimin e pot-eve, pozicionet e vendeve, madhësinë e felt-it dhe madhësitë e bastit.


## Tavolina në skedë më vete dhe dizajni modern (tetor 2026)

- Butoni "Hap tavolinën" në lobby e hap tavolinën në skedë të re (`/?table=ID`). Skeda e lobby-t mbetet në lobby. Nëse je ulur në një tavolinë, butoni shkruan "Shko te tavolina".
- Skeda e tavolinës nuk ka header-in e faqes. Me klikimin e parë kalon në ekran të plotë (shfletuesit e lejojnë ekranin e plotë vetëm pas një klikimi). "←" kthen te skeda e lobby-t. Pas largimit nga tavolina, skeda mbyllet.
- Rezultati tregon vetëm "+shumën" mbi letrat e fituesit. Hiqen shiriti i rezultatit, etiketat "poti kryesor / side pot" dhe "kthim". Detajet mbeten te Historiku. Kur ka disa fitues, klikimi mbi njërin prej tyre ndriçon pesë letrat e tij.
- Tavolina u ridizajnua pa derrasën anësore: felt jeshil me ndriçim nga qendra, vijë e hollë neon jeshile, kornizë e hollë grafit dhe dritë e butë poshtë tavolinës.

### Ekrani i plotë
Shfletuesit nuk lejojnë kalimin në ekran të plotë pa një veprim të përdoruesit. Prandaj:
- Tavolina hapet si dritare me madhësinë e gjithë ekranit, pa shirit adrese dhe skeda.
- Çdo klikim, prekje ose tast në tavolinë e rikthen ekranin e plotë kur nuk është aktiv, edhe pas Esc.
- Faqja është edhe aplikacion (PWA, `manifest.webmanifest` me `display: fullscreen`). Kur instalohet ("Instalo" në Chrome/Edge ose "Add to Home Screen" në telefon), hapet pa shiritat e shfletuesit.
- Për kompjuterë të dedikuar (kiosk), Chrome mund të niset me `--kiosk http://adresa/`, që hap gjithmonë në ekran të plotë.

## Emri Klor Poker dhe monedha në euro
Platforma u riemërua në **Klor Poker**: login, header, lobby, tavolinë, titull, manifest i aplikacionit dhe server. Të gjitha shumat shfaqen me simbolin **€** (p.sh. €98.00): portofoli, stack-et, poti, bastet, butonat, historiku, panelet e stafit dhe mesazhet e serverit. Fjala "çipa" u hoq nga ndërfaqja. Grafika e çipave në tavolinë mbetet si pjesë e pamjes së lojës. Dosja e projektit mbetet `baron-poker`, sepse ajo përcakton adresën në XAMPP.

## Sfondi i tavolinës
Pas tavolinës është një gradient i errët me ngjyrat e faqes: dritë e butë smeraldi aty ku është tavolina, që kalon në jeshile të thellë dhe pothuajse të zezë në skaje. Musteri Art Deco i mëparshëm u hoq.

## Rake pa kufi
Rake është gjithmonë përqindja e konfiguruar (5%) e pot-it të konkurruar, pa kufi për dorë. Fusha "Kufiri për dorë" u hoq nga konfigurimi. Mbeten rregullat standarde: pa flop nuk merret rake, dhe bastet që askush nuk i ndoqi kthehen pa rake. Testi i ri riprodhon përplasjen €681.70 kundër €622.37: rake = €62.23 (5% e €1,244.74, rrumbullakosur poshtë në cent).

## Telefoni: luhet horizontalisht
Në telefon vertikal, tavolina mbulohet nga njoftimi "Rrotullo telefonin" me animacion. Kur telefoni kthehet anash, njoftimi zhduket dhe tavolina hapet e madhe në gjithë lartësinë e ekranit: titulli dhe veglat qëndrojnë mbi cepin e sipërm, butonat e veprimeve në kolonë djathtas. Në Android, kur tavolina hyn në ekran të plotë, orientimi bllokohet horizontalisht. Kompjuterët dhe tabletët nuk preken.

## Mbrojtja e lojtarit që largohet pa u ngritur
Më parë, një lojtar që mbyllte skedën ose humbiste lidhjen mbetej i ulur dhe vazhdonte të paguante blinds pa dijeninë e tij. Tani:
- Shfletuesi i lojtarit njofton serverin çdo 1.3 s (në skedë të fshehur çdo ~5 s). Kur skeda mbyllet, dërgon menjëherë sinjal largimi.
- Pa sinjal për 25 s (ose 5 s pas mbylljes së skedës), lojtari kalon në **pushim automatik**: nuk merr letra dhe nuk paguan blinds. Në dorën aktuale bën check nëse është falas, përndryshe fold, pa e mbajtur tavolinën 30 s.
- Kur kthehet, rihyn automatikisht në lojë. Big blind për rihyrje paguhet vetëm nëse janë luajtur duar pa të.
- Nëse nuk kthehet brenda 5 minutave, çipat kthehen në portofol (arsyeja: "u shkëput nga loja").
- Rifreskimi i faqes nuk ndikon (ka 5 s kohë rikthimi).
Dy teste të reja e kontrollojnë këtë rrjedhë dhe që nuk humbet asnjë cent.

## Letrat dhe tavolina në telefon
Në telefon horizontal tavolina është më e madhe, p.sh. 516×246 në vend të 484×230 në një ekran 740×360, dhe zë saktësisht ekranin, pa scroll. Letrat e vogla kanë pamje si në aplikacionet e pokerit: numër dhe simbol të mëdhenj në cepin e sipërm dhe simbolin në cepin e poshtëm, pa mbivendosje. Kontrollet automatike nuk gjejnë mbivendosje në 568×320, 740×360, 844×390 dhe 1366×768.

### Rrotullimi automatik
Njoftimi "Rrotullo telefonin" ka butonin "▶ Luaj horizontalisht". Në Android, një prekje e vendos lojën në ekran të plotë dhe e rrotullon ekranin horizontalisht vetë. Në aplikacionin e instaluar (PWA) rrotullimi provohet automatikisht sapo hapet tavolina. Në iPhone Apple nuk e lejon, prandaj butoni fshihet dhe mbetet udhëzimi për ta kthyer telefonin.

## Kontrollet në telefon (horizontal)
- Tavolina zë gjithë ekranin. Paneli anësor u hoq; titulli dhe veglat qëndrojnë mbi cepin e sipërm.
- Në cepin poshtë djathtas ka **3 butona të rrumbullakët**: Fold, Check/Call, Raise (Bet). Kur ka bast, Check bëhet **Call** dhe poshtë tij shfaqet shuma që duhet vënë.
- **Raise me dy prekje:** prekja e parë hap panelin e shumës (⅓, ½, ¾, Pot, All-in, slider), butoni bëhet "OK €X" dhe prekja e dytë konfirmon. Kështu shmangen ngritjet aksidentale.
- Kur nuk është radha jote, në vend të butonave dalin tre rrathë për veprimet paraprake (Check/Fold, Check, Call çdo bast).
- Info e dorës (radha, kombinimi, time bank) del në një etiketë të vogël poshtë majtas.
- Për lojë praktike: telefoni dridhet kur vjen radha, ekrani nuk fiket gjatë lojës (Wake Lock) dhe zmadhimi me prekje të dyfishtë është çaktivizuar.
- Kontrolli automatik me 6 lojtarë në tavolinë nuk gjen mbivendosje në 568×320, 667×375, 740×360, 844×390 dhe 915×412. Në ekranet më të ngushta tavolina zhvendoset pak majtas që butonat të mos mbulojnë lojtarët.

### Tavolina nga skaji në skaj
Në telefon horizontal tavolina nuk e mban më formën fikse 2.1:1; mbush gjithë gjerësinë dhe lartësinë e ekranit. Për shembull: 716×262 në 740×360 (më parë 550×262), 820×292 në 844×390, 891×314 në 915×412. Lojtarët në të djathtë janë vendosur që të mos i mbulojnë butonat. Titulli i tavolinës fshihet në telefon (mbetet vetëm "←"). Kontrolli automatik me 6 lojtarë dhe butonat e dukshëm nuk gjen mbivendosje në 667×375, 740×360, 844×390 dhe 915×412; në 568×320 (iPhone SE i vjetër) butoni "←" mbulon vetëm 9×8 px të një letre të kthyer.

### Butonat në rresht dhe glow i radhës
Në telefon horizontal tavolina ka pak hapësirë anash (5% e gjerësisë). Fold, Check/Call dhe Raise janë në një rresht poshtë djathtas, me diametër 68 px (58 px në telefonat shumë të vegjël). Kur është radha jote, butoni jeshil (Raise/Bet) ka një glow që pulson. Lojtarët anash janë ngritur pak që rreshti i butonave të mos i mbulojë. Kontrolli automatik me 6 lojtarë nuk gjen mbivendosje në 568×320, 667×375, 740×360, 844×390 dhe 915×412.

## Rrjedha e tavolinës dhe hapja e saj
- **Tavolina pastrohet kur nuk ka dorë të re.** Pas rezultatit (8 s), nëse nuk ka dy lojtarë me fonde, tavolina kthehet në pritje: pa board, pa letra, pa pot dhe pa rezultat. Më parë letrat e dorës së fundit mbeteshin në tavolinë pa afat. Kjo ka test.
- **Hapja në të njëjtën skedë.** "Hap tavolinën" nuk hap më skedë apo dritare të re. Adresa bëhet `/?table=ID`, faqja kalon në ekran të plotë me të njëjtin klikim dhe në telefon Android rrotullohet horizontalisht. "←" kthen te lobby në të njëjtën skedë; butoni "mbrapa" i shfletuesit funksionon gjithashtu.
- **Pa ndezjen e login-it.** Kur ka sesion, gjatë rifreskimit shfaqet vetëm logoja Klor Poker me një rreth që rrotullohet; formulari i hyrjes del vetëm kur nuk ka sesion të vlefshëm.
- **Butonat në telefon** qëndrojnë 36–55 px larg skajit djathtas, sipas ekranit, jo në cep.
- **Radha e animimeve:** bastet mblidhen në pot, çipat shkojnë te fituesi dhe vetëm pas mbërritjes së tyre shfaqet "+shuma".

## Poti në qendër dhe animimet
- Shkrimet "POTI" dhe "POTI I DORËS" u hoqën. Në qendër të tavolinës janë çipat e potit dhe poshtë tyre shuma e gjithë potit. Çipat tregojnë vetëm atë që është mbledhur në mes; bastet e raundit aktual mbeten para lojtarëve derisa të mblidhen.
- Radha e animimeve: bastet rrëshqasin te pot-i dhe grumbulli rritet vetëm kur çipat mbërrijnë. Në showdown letrat shihen 0.75 s para se pot-i të paguhet. Çipat shkojnë te fituesi pot pas poti, pastaj del "+shuma", pas rreth 2.6 s poti zhduket dhe dora tjetër nis pas 8 s.
- Në telefon butonat janë më larg skajit djathtas: në ekranet e mesme deri në 90 px, në të ngushtat aq sa lejon emri yt që të mos mbulohet. Midis tyre ka 18 px hapësirë.
- Kontrolli automatik me 6 lojtarë nuk gjen mbivendosje në 568×320, 667×375, 740×360, 844×390, 915×412 dhe 1366×768.

## Siguria e llogarive dhe kontrolli i tavolinave
**Sesionet**
- Mbyllen pas 30 minutash pa asnjë kërkesë, p.sh. kur skeda mbyllet, dhe në çdo rast pas 12 orësh. Vlerat ndryshohen me `SESSION_IDLE_MS` dhe `SESSION_MAX_MS`.
- Një llogari ka vetëm një sesion: hyrja nga një pajisje tjetër mbyll të mëparshmin dhe faqja shfaq arsyen.
- Pas 20 minutash pa asnjë veprim, kur lojtari nuk është i ulur në tavolinë, faqja e nxjerr automatikisht.

**Hyrja**
- Pas 5 fjalëkalimeve të gabuara, për të njëjtën adresë dhe llogari, hyrja bllokohet për 15 minuta.
- Krahasimi i fjalëkalimit bëhet në kohë konstante.

**Fjalëkalimet**
- Kërkohen të paktën 8 karaktere, me shkronja dhe numra.
- Përdoruesi e ndryshon vetë te "Llogaria ime"; pas ndryshimit mbyllen sesionet e tjera.
- Menaxheri i drejtpërdrejtë mund të vendosë fjalëkalim të ri për llogaritë e veta.

**Bllokimi**
- Menaxheri i drejtpërdrejtë mund të bllokojë ose zhbllokojë llogaritë e veta.
- Llogaria e bllokuar nuk hyn dot, sesioni i saj mbyllet menjëherë dhe çipat e tavolinës kthehen në portofol.
- Bllokimi dhe zhbllokimi regjistrohen në historik.

**Paneli i stafit**
- Për çdo llogari tregon nëse është online, offline ose e bllokuar, dhe kur ka hyrë për herë të fundit.

**Tavolinat**
- Një vend në tavolinë ku nuk mund të luhet dorë lirohet pas 10 minutash dhe çipat kthehen në portofol.
- Pushimi vullnetar zgjat maksimumi 5 minuta.
- Mbeten mbrojtjet ekzistuese: 2 duar pa veprim → largim; i shkëputur 25 s → pushim automatik; 5 minuta i shkëputur → çipat në portofol.

**Serveri**
- Header-a sigurie në çdo përgjigje: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, dhe HSTS kur faqja hapet me HTTPS.

## Telefoni: brenda ekranit, vende simetrike, butona më të mëdhenj
- **Zonat e sigurta:** faqja respekton "safe area" në telefonat me notch ose shirit shtëpie, që asgjë të mos dalë jashtë pjesës së dukshme të ekranit.
- **Lartësia e tavolinës:** llogaritet që lojtarët e poshtëm anash të përfundojnë sipër butonave dhe ti të mbetesh brenda ekranit.
- **Vende simetrike:** gjashtë vende fikse rreth tavolinës: një sipër, dy majtas, dy djathtas dhe ti poshtë në qendër. Letrat e lojtarëve të tjerë qëndrojnë pranë avatarit, nga ana e tavolinës.
- **Butonat:**
  - 74 px në telefonat e mëdhenj dhe 66 px në ata të mesëm, me 14–16 px hapësirë midis tyre;
  - 45–120 px larg skajit djathtas, pa mbuluar emrin tënd;
  - në iPhone SE 64 px.
- **Poti:** në telefon është më kompakt (çipa më të vegjël, shuma poshtë), që të mos prekë lojtarin sipër dhe kartat.
- **Kontrolli automatik me 6 lojtarë:** asnjë mbivendosje dhe asgjë jashtë ekranit në 667×375, 740×360, 844×390, 915×412 dhe 932×430. Në 568×320 (iPhone SE) mbetet vetëm një prekje prej 4 px te poti.
- **Gabimet:** gjatë lojës nuk u gjet asnjë gabim JavaScript apo gabim serveri. Dridhja e telefonit tani provohet vetëm pasi përdoruesi ka prekur ekranin.

## Loja në kohë reale dhe mbrojtja nga humbja e parave pa dijeni
- **Tavolina live:** serveri i dërgon çdo lojtari gjendjen e tavolinës menjëherë sapo ndryshon diçka (stream `/api/table/:id/stream`), pa pritur rifreskimin. Nëse lidhja bie, faqja kalon vetë te rifreskimi periodik dhe rilidhet pas 2 sekondash.
- **Prania vërtetohet vetëm nga vetë lojtari:** një lidhje e harruar/gjysmë e hapur nuk e mban lojtarin "të pranishëm". Kur ekrani fshihet (mbyll aplikacionin, kalon në app tjetër, fik ekranin) faqja ndalon lidhjen dhe rifreskimin e tavolinës.
- **Pa letra pa qenë i pranishëm:** në fillim të çdo dore, kush nuk është parë në 12 sekondat e fundit vihet në pushim *para* se të merren blinds. Kush mbyll faqen vihet në pushim brenda pak sekondash; pas 3 minutash pa u kthyer, çipat i kthehen në portofol.
- **Nuk veprove në kohë = pushim:** kur i mbaron koha, loja bën vetë check/fold dhe lojtari kalon menjëherë në pushim (asnjë blind nuk i merret më). Rikthehet vetëm kur shtyp **↺ Kthehu**; mesazhi në tavolinë ia shpjegon këtë. Pas 5 minutash pushim ngrihet automatikisht dhe çipat kthehen në portofol.
- **Hapja e letrave të tavolinës si te dealer-i:** çdo letër e flop/turn/river del me shpinë nga kuverta, rrëshqet në vendin e saj dhe kthehet me fytyrë; tre letrat e flop-it dalin njëra pas tjetrës me një vonesë të shkurtër. Letrat e reja fshihen deri në momentin e animimit, që të mos shfaqen para kohe.

## Telefoni: letrat në mes, butonat larg letrave të tua (e matur)
- **Letrat e tavolinës** janë saktësisht në qendër të tavolinës (0–1 px nga mesi në çdo madhësi telefoni). Poti (çipat + shuma) qëndron menjëherë sipër letrave, i llogaritur nga lartësia e letrës, jo me përqindje të hamendësuara.
- **Lojtari sipër** ka emrin/shumën në të majtë të avatarit dhe letrat në të djathtë, që poti të ketë vend edhe në telefonat e vegjël.
- **Butonat** janë sa më djathtas që lejon ekrani (maksimumi 40 px nga cepi, kurrë ngjitur me të): hapësira llogaritet nga gjysma e emrit tënd + 40 px largësi + gjerësia e tre butonave. Në asnjë madhësi nuk prekin letrat, emrin apo avatarin tënd.
- **Butoni D** i lojtarëve anësorë është pak më brenda tavolinës, që të mos bjerë mbi avatarin e tyre.
- E kontrolluar në 568×320, 667×375, 740×360, 844×390, 915×412 dhe 932×430: asnjë mbivendosje, asgjë jashtë ekranit.

## Telefoni: faqja është fiks sa ekrani
- **Problemi:** drita dekorative rreth tavolinës (`.tableStage::after`) ishte më e gjerë se tavolina. Në telefonat e mëdhenj (p.sh. 932×430) dilte jashtë ekranit, faqja bëhej 990×436 dhe shfletuesi e zvogëlonte/lejonte lëvizje, prandaj gjithçka dukej më e madhe se ekrani.
- **Zgjidhja:** në telefon tavolina pritet saktësisht në kufijtë e ekranit dhe faqja nuk lëviz më. Drita jashtë ekranit nuk shihej gjithsesi.
- E kontrolluar: 932×430, 915×412, 915×340, 844×390, 844×330, 740×300, 667×375, 568×320, 568×270, portret 390×844 dhe desktop 1280×800: faqja është fiks sa ekrani dhe asgjë nuk pritet.

## Inspektimi live (vetëm qendra)
- Faqe e re te paneli i qendrës: **Inspektimi live**. Shfaq çdo tavolinë në kohë reale: letrat e tavolinës, potin, radhën me sekondat që mbeten dhe, për çdo lojtar, **të dyja letrat**, stack-un, sa ka futur në pot, veprimin e fundit, kombinimin aktual dhe **shansin e fitores (%)**, i cili përditësohet në çdo rrugë.
- **Kush e sheh:** vetëm llogaria CENTER. Admin, agjent dhe lojtar marrin 403. Qendra nuk mund të ulet në tavolinë, prandaj nuk mund ta përdorë për të luajtur.
- **Gjurmë:** çdo hapje e faqes regjistrohet në historik si "Inspektim tavolinash", me orën dhe adresën IP (një herë në 10 minuta).
- **Paralajmërim kundër hileve:** kur dy ose më shumë lojtarë në të njëjtën tavolinë lidhen nga e njëjta adresë IP, del një njoftim i kuq dhe emrat e tyre shënohen me "IP". Kjo është shenja më e shpeshtë e bashkëpunimit ose e disa llogarive të një personi.
- Shanset llogariten në sfond me pjesë të vogla dhe vetëm kur faqja është e hapur, që lojërat të mos ngadalësohen. Llogaritja është e saktë në turn dhe river, ndërsa në preflop dhe flop bëhet me mostra.

## Rregullim: sesioni i skaduar nuk bllokonte ndërfaqen
- **Problemi:** kur tavolina lihej hapur gjatë në browser, sesioni skadonte te serveri (30 min pa kërkesë), por faqja vazhdonte të tregonte lobby-n e lojtarit dhe lejonte veprime (zgjedhje tavoline, hyrje). Veprimet dështonin me 401, por ndërfaqja mbetej "e gjallë". Shkaku: kur tab-i rri në sfond, shfletuesi e ngadalëson polling-un, kështu që asgjë nuk e kapte skadimin derisa përdoruesi klikonte.
- **Zgjidhja:** sapo tab-i rimerr fokusin (`visibilitychange`/`focus`/`pageshow` — ngjarje që nuk ngadalësohen), faqja ri-verifikon sesionin menjëherë me një kërkesë te serveri. Një 401 kalon te `sessionEnded()`, i cili tani **e rikthen plotësisht pamjen te login-i**: fsheh lojën dhe lobby-n, del nga modaliteti i tavolinës, pastron token-in dhe tregon "Sesioni përfundoi. Hyr përsëri."
- E provuar: me sesion 6-sekondësh, pas skadimit dhe kthimit te tab-i, ekrani i hyrjes merr përsipër vetë, pa asnjë klik, dhe ndërfaqja e vjetër nuk klikohet më.

## Rregullime: zmadhimi i faqes dhe krediti në telefon
- **Krediti i lojtarit poshtë-në-mes nuk dukej:** vendi yt ishte në buzën e poshtme të tavolinës dhe emri/krediti varej nën të, duke dalë jashtë ekranit në telefona me pak lartësi ose me shirit shfletuesi. Zgjidhja: vendi yt u ngrit pak lart dhe tavolina u shkurtua lehtë, që krediti të qëndrojë brenda kornizës me hapësirë (48–65 px nën të, provuar në 667×375, 844×390, 932×430). Krediti shfaqet edhe poshtë-majtas.
- **Faqja zmadhohej kur logohesh:** fushat e hyrjes ishin 12 px, prandaj shfletuesi i telefonit zmadhonte automatikisht kur i prekje. Tani fushat janë 16 px në telefon dhe faqja nuk lejon zmadhim (`maximum-scale=1, user-scalable=no`).
- **Faqja zmadhohej/zvogëlohej kur bëje veprime (PC dhe telefon):**
  - Në PC: paneli i veprimeve ndryshonte lartësi kur vinte radha jote (150 px → 172 px), dhe kjo e ri-përmasonte tavolinën në çdo veprim. Tani paneli ka lartësi të qëndrueshme (176 px), kështu tavolina nuk lëviz më.
  - Në telefon: prekja e shpejtë e butonave bënte "double-tap zoom". Tani zmadhimi është i çaktivizuar nga viewport-i.

## Telefoni: tavolina shkallëzohet sipas ekranit (fit-to-screen)
- **Problemi:** në telefona me pak lartësi (sidomos me shiritin e shfletuesit të dukshëm) tavolina zvogëlohej, por ulëset, emrat, letrat dhe butonat mbeteshin me madhësi fikse në piksel, prandaj dukeshin shumë të mëdha dhe mbulonin tavolinën. Rregullat e veçanta për çdo madhësi nuk e zgjidhnin dot.
- **Zgjidhja:** në telefon horizontal, tavolina vizatohet mbi një kanavacë të paktën 800×390 dhe shkallëzohet proporcionalisht që të mbushë saktësisht ekranin. Çdo element ruan përmasat e veta në çdo pajisje dhe asgjë nuk del jashtë kornizës. Hapësirat për notch-in dhe shiritin e poshtëm korrigjohen sipas shkallës. U hoqën 7 blloqe rregullash për madhësi të veçanta që nuk duhen më.
- **Teksti nuk zmadhohet vetë:** `text-size-adjust:100%` ndalon iPhone-in të zmadhojë tekstin në horizontal dhe Android-in ta shkallëzojë sipas cilësimit të madhësisë së shkronjave.
- **Hyrja:** fushat janë 16 px në çdo ekran me prekje (pa marrë parasysh gjerësinë, rregulli i mëparshëm vlente vetëm nën 900 px dhe telefoni horizontal është më i gjerë), kështu që prekja e tyre nuk zmadhon faqen. Kutia e hyrjes futet e plotë në ekran edhe horizontalisht; në ekranet shumë të ulëta logo është majtas dhe forma djathtas.
- E provuar në 568×280, 568×320, 640×300, 640×360, 667×375, 720×320, 740×360, 844×390, 915×412, 932×430: faqja është fiks sa ekrani, pa mbivendosje, asgjë jashtë kornizës, krediti yt me 35–66 px hapësirë poshtë; butonat e veprimit nuk prekin asnjë lojtar. Desktopi nuk ndryshon.

## Telefoni: tavolina dhe letrat më të mëdha
- Kanavaca bazë u zvogëlua nga 800×390 në 730×365, kështu që shkalla në telefon rritet (p.sh. 640×360: 0.80 → 0.89; 844×390: 1.00 → 1.07; 932×430: 1.10 → 1.18) dhe çdo gjë del më e madhe.
- Më pak hapësirë bosh lart dhe poshtë tavolinës, që tavolina të zërë më shumë nga ekrani.
- Letrat më të mëdha në telefon: letrat e tavolinës, letrat e tua dhe letrat e kundërshtarëve; emrat dhe krediti me shkronja më të mëdha.
- Vendi yt u ul pak (97%) që letrat e tua të mos prekin letrat e tavolinës.
- Matur (lojtari në dorë, me letrat e tavolinës të hapura): nga 568×280 deri te 932×430 asgjë nuk mbivendoset, asgjë nuk del jashtë ekranit, faqja është fiks sa ekrani. Letrat e tavolinës: 39×54 px në telefonin më të vogël deri në 59×83 px në më të madhin (më parë 38×53 në 640×360).

## Tavolina fiks sa ekrani në çdo pajisje (rregullim përfundimtar)
- **Pse në disa pajisje dilte shumë e madhe:** drita dekorative rreth tavolinës është 25% më e gjerë se tavolina. Në telefon ishte prerë, por jo në tablet dhe laptop. Aty ku tavolina është e gjerë krahasuar me dritaren (p.sh. iPad horizontal 1024×768), faqja bëhej më e gjerë se ekrani (1053 px) dhe shfletuesi zmadhonte/zvogëlonte gjithë faqen. Tani drita nuk mund të jetë më e gjerë se zona e tavolinës në asnjë ekran, dhe faqja e tavolinës nuk lëviz kurrë anash.
- **Pas rrotullimit ose hyrjes në full screen**, disa shfletues (sidomos Safari në iPhone) e japin madhësinë e re me vonesë; tani tavolina rimatet edhe pas 100, 350 dhe 800 ms.
- E kontrolluar në 24 madhësi: telefonë horizontal (568×280 deri 932×430), telefonë vertikal (360×780 deri 430×932), tablet vertikal (768×1024, 820×1180, 600×960), tablet horizontal (1024×768, 1024×600, 1112×834, 1180×820), laptop/desktop (960×600, 1280×720, 1366×657, 1440×800, 1536×730, 1920×950). Në të gjitha faqja është fiks sa ekrani dhe asnjë element nuk del jashtë.

## Full screen në telefon: tavolina nuk humbet më përmasat
- **Shkaku:** kur prekje ekranin, faqja hynte në full screen dhe aktivizohej rregulli `:fullscreen body[data-view=table] .game{min-height:100dvh}`. Ky rregull ishte më specifik se shkallëzimi i tavolinës, prandaj e zgjaste kanavacën në lartësinë reale të ekranit para se të shkallëzohej. Tavolina dilte jashtë ekranit (p.sh. 844×417 në një ekran 390 px) dhe tavolina rivizatohej me përmasa të gabuara. Provat e mëparshme nuk e kapnin, sepse dritarja e provës nuk hyn dot vërtet në full screen.
- **Zgjidhja:** në telefon, gjeometria e kanavacës (pozicioni, gjerësia, lartësia, padding-u, shkalla) është absolute (`!important`) dhe asnjë rregull tjetër, as ai i full screen-it, nuk e ndryshon dot. Faqja dhe tavolina nuk lëvizin, nuk kërcejnë dhe nuk zmadhohen me gishta (`touch-action:none`, `overscroll-behavior:none`). Butonat, slider-i i bastit dhe paneli anësor (historiku, chat-i) punojnë normalisht.
- **Prova:** me rregullat e full screen-it aktive, 14 madhësi telefoni, secila para full screen-it (me shiritin e shfletuesit) dhe pas (lartësi e plotë): 568×264/320, 640×304/360, 667×319/375, 720×304/360, 740×304/360, 760×304/360, 780×304/360, 800×304/360, 844×334/390, 851×393, 869×356/412, 915×356/412, 932×374/430. Në të 26 provat tavolina është saktësisht sa ekrani, pa mbivendosje, asgjë jashtë kornizës, krediti yt me 20–48 px hapësirë poshtë.

## PC: tavolina e plotë që në hapje, pa ndryshime
- **Pse ndryshonte:** çdo klikim ose tast në faqen e tavolinës kërkonte full screen (edhe në PC). Faqja hapej në dritaren normale (tavolina e vogël) dhe me klikimin e parë kalonte në full screen (tavolina e madhe). Përveç kësaj, në dritaren normale paneli i butonave poshtë zinte shumë vend dhe tavolina dukej e vogël.
- **Tani në PC:** asnjë klikim nuk e ndryshon dritaren. Full screen hapet vetëm nga menyja "⋯ → Ekran i plotë". Në telefon prekja e parë e ekranit vazhdon ta hapë full screen-in, sepse fsheh shiritat e shfletuesit.
- **Tavolina shkallëzohet sipas dritares:** i gjithë layout-i i PC-së vizatohet në 1000×760 (ose më gjerë) dhe shkallëzohet që të mbushë saktësisht dritaren. Tavolina është e plotë që në hapje dhe ruan të njëjtat përmasa në çdo dritare (tapeti gjithmonë 53% e lartësisë); nëse ndryshon dritarja ose hyn në full screen, gjithçka shkallëzohet njësoj, pa u rirregulluar.
- E provuar: 1024×768, 1280×650, 1366×657, 1366×768, 1440×780, 1536×730, 1920×950, 1920×1080, 2560×1300: tavolina fiks sa dritarja, asnjë mbivendosje, asgjë jashtë. Te 1366×657 tapeti u rrit nga 632×301 në 730×348 dhe letrat nga 43×60 në 50×69. Telefoni dhe lobby nuk ndryshuan.

## Ngjyra e tavolinës
- **Krijimi:** te paneli i qendrës → Tavolinat, forma ka "Ngjyra e tavolinës": 8 ngjyra të gatshme (Smerald, Blu mbretëror, Bordo, Vjollcë, Oqean, Ar, Grafit, E kuqe) dhe "Ngjyrë tjetër" për çdo ngjyrë, me parapamje të menjëhershme të tavolinës.
- **Dizajni nga një ngjyrë:** nga ngjyra e zgjedhur gjenerohet i gjithë dizajni: 5 nuancat e gradientit të tapetit (nga qendra e ndritshme te buza e errët), vija neon e buzës, drita rreth tavolinës, drita poshtë saj dhe drita e dhomës përreth. Ngjyrat gri bëhen grafit elegant. Ndryshimi i ngjyrës kalon butë (0.6 s).
- **Ndryshimi më vonë:** te lista "Tavolinat e platformës", klikimi mbi ikonën ♠ të tavolinës hap zgjedhësin e ngjyrës; lojtarët e shohin ngjyrën e re menjëherë.
- **Lobby:** çdo kartë tavoline shfaqet me ngjyrën e saj.
- **Siguria:** pranohet vetëm `#rrggbb`; vetëm qendra krijon ose ndryshon ngjyrën (403 për të tjerët); tavolinat e vjetra marrin smeraldin si parazgjedhje. E mbuluar me teste.

## Lobby: 4 tavolina për rresht, me ngjyrën e secilës
- Në kompjuter tavolinat shfaqen 4 për rresht (3 në ekrane mesatare, 2 në tablet, 1 në telefon).
- Çdo kartë merr ngjyrën e tavolinës së saj: tavolina e vogël, drita e kartës, buza dhe butoni "Hap tavolinën".
- Shënim: tavolinat e krijuara para veçorisë së ngjyrave marrin smeraldin; ngjyra u ndryshohet nga paneli i qendrës (Tavolinat → kliko ikonën ♠).

## Raporti i të ardhurave (qendra, adminë, agjentë)
- **Faqja "📈 Të ardhurat"** për çdo pjesëtar të hierarkisë përveç lojtarit. Çdokush sheh vetëm rrjetin e vet: qendra gjithçka, admini vetëm agjentët dhe lojtarët e vet, agjenti vetëm lojtarët e vet (serveri kthen 403 për çdo degë tjetër).
- **Sa:** të ardhurat (rake) në periudhë me krahasim me periudhën e mëparshme të njëjtë (▲/▼ %), duart me rake, lojtarët kontribues, rake mesatar për dorë, tavolinat aktive.
- **Nga kush:** ndarja sipas pjesëtarëve të nivelit më poshtë (adminët / agjentët / lojtarët) me shumë, përqindje, duar dhe numër lojtarësh; kliko një pjesëtar për të hyrë në rrjetin e tij (qendër › admin › agjent), me rrugën e navigimit lart. Lista e lojtarëve kontribues me agjentin dhe adminin e secilit, me kërkim.
- **Si:** sipas tavolinës (blinds, duar, rake për dorë, ngjyra e tavolinës), orët e pikut (24 orë), grafiku ditor ose mujor (për periudha mbi 3 muaj), dhe 60 duart e fundit me ndarjen e rake-ut për lojtar.
- **Filtrat e datave:** Sot, Dje, 7 ditët e fundit, 30 ditët e fundit, Ky muaj, Muaji i kaluar, Ky vit, Gjithë kohën, ose data të lira "Nga / Deri". Datat llogariten sipas orës së Tiranës.
- **Eksporti CSV** (për Excel): çdo kontribut i periudhës (data, ora, tavolina, dora, lojtari, agjenti, admini, rake) me total në fund.
- Faqja rifreskohet vetë çdo 30 sekonda kur periudha përfshin sot; kërkesat e vjetra nuk mbishkruajnë kurrë të rejat.
- Rake i vjetër pa detaje për lojtar shfaqet te qendra si "Pa atribuim".
- E testuar: test njësie (izolimi i degëve, ndarja, filtrat e datave, periudha e mëparshme, eksporti) dhe provë në shfletues me 19 përdorues dhe 2,038 duar.

## Përqindjet e rrjetit (revenue share)
- **Si caktohen:** qendra i cakton adminit një përqindje kur e krijon ose më vonë (te Llogaritë → "％ Përqindja"). Admini i cakton agjentit përqindjen e tij, gjithmonë brenda përqindjes së vet (serveri e refuzon çdo vlerë mbi kufi). Lojtarët nuk kanë përqindje. Lejohen vlera 0–100% me deri 2 shifra pas presjes (p.sh. 12,5%).
- **Si ndahet rake-u:** për çdo dorë, nga rake-u që paguajnë lojtarët e një agjenti: agjenti merr përqindjen e vet (Y%), admini diferencën (X−Y)%, qendra pjesën tjetër. Paratë kalojnë automatikisht në balancën e secilit në fund të dorës; ndarja ruhet te regjistri i dorës.
- **Saktësia:** pjesët nën 1 cent nuk humbasin: ruhen te llogaria dhe paguhen sapo mbushin 1 cent, ndaj në kohë të gjatë secili merr saktësisht përqindjen e vet (provuar: 15.00%, 20.00%, 25.00%). Shuma e ndarjes është gjithmonë e barabartë me rake-un (provuar në 2000+ ndarje të rastësishme dhe në një dorë të plotë në motor).
- **Kur ndryshohet:** ndryshimi vlen për duart e ardhshme. Nëse qendra ia ul adminit përqindjen nën atë të agjentëve të tij, agjentët kufizohen automatikisht në kufirin e ri dhe qendra njoftohet se kush u kufizua.
- **Ku shihet:** përqindja shfaqet pranë rolit (p.sh. "Administratori · 12%") dhe te lista e llogarive; historiku i kreditit tregon çdo komision ("Komision nga rake · Tavolina · dora") dhe çdo ndryshim përqindjeje ("18% → 12%", "Kufizuar automatikisht"); raporti i të ardhurave tregon "Fitimi yt", "Komisione për rrjetin" dhe komisionin e çdo dege.

## Tavolina me të njëjtin proporcion në çdo telefon (përfshirë iPhone 13 Pro Max)
- **Pse dukej e vogël në iPhone:** (1) Safari në iPhone nuk lejon ekran të plotë, prandaj shiriti i tij ha lartësi; (2) notch-i dhe shiriti i poshtëm (47 px majtas/djathtas, 21 px poshtë) zbriteshin nga brenda tavolinës dhe e ngushtonin tapetin deri në 13%; (3) ekrani 926 px është shumë i gjerë dhe tavolina, e kufizuar nga lartësia, linte hapësirë bosh anash (tapeti zinte vetëm rreth 70% të gjerësisë).
- **Zgjidhja:** tavolina shkallëzohet brenda zonës së sigurt (jashtë notch-it dhe home indicator-it) në vend që ato të zbriten nga brenda; tapeti përdor gjerësinë shtesë të ekraneve të gjata (deri 3.4:1); ulëset anash poshtë u ngritën pak (72% → 67%) që tapeti të marrë më shumë lartësi, kështu edhe letrat dalin më të mëdha.
- **Rezultati:** në çdo telefon tapeti zë 90% të gjerësisë së zonës së dukshme dhe letrat rriten me ekranin (letrat e tavolinës nga 40×56 px te 568×280 deri në 61×85 px te 915×412). iPhone 13 Pro Max: në Safari tapeti 748×235 me letra 53×74; nga Home Screen 749×268 me letra 58×82. Asnjë mbivendosje, asgjë në zonën e notch-it; butonat e veprimit nuk prekin asnjë lojtar.
- **Ekran i plotë në iPhone:** Safari nuk e lejon, por faqja e shtuar në ekranin bazë (Shpërnda → Shto në ekranin bazë) hapet pa shiritat e Safari-t. Lobby i tregon këtë këshillë një herë përdoruesve të iPhone/iPad që hapin faqen nga Safari. U shtua ikona PNG (180×180) që kërkon iPhone për ekranin bazë.

## Lobby si listë
- Kartat e veçanta u zëvendësuan me një listë të vetme dhe responsive.
- **Në kompjuter:** tabelë me kolonat ID, Tavolina (me ngjyrën e saj), Blinds, Buy-in, Lojtarë (6 pikat e vendeve + x/6), Statusi (live me jeshile) dhe butoni "Hap" në ngjyrën e tavolinës. Klikimi i titullit të kolonës e rendit listën (rritëse/zbritëse); klikimi i rreshtit e hap tavolinën.
- **Kërkim dhe filtra:** kërko sipas emrit ose ID-së (#6), "Vetëm me vende të lira", "Vetëm ku po luhet". Kërkimi nuk e humb fokusin kur lista rifreskohet vetë.
- **Në telefon:** çdo tavolinë është një rresht kompakt me dy vija (#ID · emri · Hap / blinds · buy-in · lojtarë · statusi).
- Tavolina ku je ulur shënohet "ulur këtu"; pa kredit, butoni çaktivizohet.

## Home page, regjistrim me ftesë dhe faqja në anglisht

- **E gjithë platforma në anglisht:** index.html (`lang="en"`), app.js, table-visuals.js, mesazhet e lojës (game.js), gabimet e serverit (server.js), rake.js dhe manifest. Datat shfaqen me `en-GB`. Etiketat e vendeve tani janë `SIT OUT / WAITING / LEAVING / WINNER` (selektorët në table.css u përditësuan). Testet u përshtatën me tekstet e reja.
- **Home page e re** (`public/home.css`, `public/home.js`): faqja nuk hapet më direkt te login. Ka hero me tavolinë 3D të animuar (letrat shpërndahen, çipat lëvizin, tilt me mausin), shirit promocionesh, 6 karta veçorish, 2 banera promocionale, numra live (tavolina, lojtarë, duar në lojë) nga `/api/public/stats`, tavolinat kryesore, hapat "si funksionon", CTA finale dhe footer 18+ / lojë e përgjegjshme. Animacionet fiken me `prefers-reduced-motion`.
- **Sign in / Register** hapen në një dritare (`#authDialog`) me dy tab-e. Kur sesioni mbaron, faqja kthehet te home page me dritaren e hyrjes të hapur dhe mesazhin përkatës.
- **Regjistrimi me kod ftese:** çdo agjent ka një kod (10 shenja hex) dhe link `https://klorpoker.com/?ref=KODI`, që shfaqen te paneli i agjentit (Overview → "Your invite link", me Copy dhe "New link" që çaktivizon të vjetrin). Lojtari që regjistrohet bie direkt nën atë agjent me portofol 0; regjistrimi shënohet në historikun e agjentit ("Player registered"). Pa kod të vlefshëm nuk krijohet llogari. Kufizime: 10 tentativa/orë për IP, konfirmim 18+, i njëjti rregull fjalëkalimi si kudo.
- **Lobby në celular:** butoni "Open" është në mes vertikal të rreshtit.
- Testet: 52/52 kalojnë (shtuar kontrolle për regjistrimin, kodin e gabuar, 18+, emrin e zënë, rinovimin e kodit dhe statistikat publike pa të dhëna private).

## Home page e ridizajnuar (premium)
- Hero kinematik me imazhin real të tavolinës luksoze (`home-table.webp` 120 KB, `home-table-m.webp` 49 KB për celular, nga `design-reference.png` 2.1 MB), me zoom të ngadaltë, dritë që kalon, pluhur ari (canvas) dhe grain.
- Në plan të parë: A♠ K♠ me të njëjtat letra si në lojë (shpërndahen me animacion dhe ndjekin mausin) dhe çipa 3D.
- Tipografi luksoze: tituj të mëdhenj + serif italik ari; butona ari me shkëlqim; ikona SVG në vend të emoji-ve.
- Seksione: shirita të kryqëzuar me tekst lëvizës, "showcase" i tavolinës në kornizë që drejtohet me scroll dhe pika që tregojnë veçoritë, bento grid me kufij ari që rrotullohen, shirit me 10 kombinimet e pokerit me letra reale, 3 hapat e ftesës me vijë të animuar, CTA finale me çipa që bien, footer 18+.
- Në tablet dhe celular letrat dalin mbi titull (nuk e mbulojnë), çdo gjë brenda ekranit, pa scroll horizontal.
- **Rifinim:** në hero një royal flush (10-J-Q-K-A ♠) shpërndahet me shpinë të zezë/ari, kthehet një nga një dhe hapet si fan me shpërthim drite smerald/ari, xixa dhe shkëlqim mbi letra. Çipat janë vizatuar në SVG si cilindra realë (anët me inserte, faqja me unazë, inlay dhe ♠). Butonat janë smerald si në lojë. Join / Sign in duken menjëherë pa scroll (edhe në celular, krah për krah). Shiriti jeshil është mbi atë të artë.
- **Letrat dhe çipat statike:** royal flush-i në hero është tani 3D statik (perspektivë, trashësi letre, hije reale), pa asnjë animacion apo efekt. Dizajn modern e i pastër: numri dhe simboli në qoshe, një ♠ i madh në mes, pa korniza apo panele brenda letrës. Çipat qëndrojnë në tavolinë pa lëvizje; edhe çipat në fund të faqes janë statikë.
- **Imazhi i çipave:** në vend të letrave, hero tani tregon imazhin e çipave smerald/zi/ari (`home-chips.webp` 127 KB, `home-chips-m.webp` 54 KB për celular), statik, me sfond transparent.
- **Titulli i hero-s:** "Place your bets. / Go all-in. / *Win big.*"
- **Hero me foton e çipave:** fotoja e çipave (`home-chips.webp`, `home-chips-m.webp` për celular) u rikthye në hero.
- **Hero mbush ekranin e parë:** elementet kanë më shumë hapësirë mes tyre, blloku qendrohet vertikalisht dhe numrat live dalin në fund të ekranit të parë (kompjuter, tablet, celular).

## Pot Limit Omaha (PLO)
- **Si luhet:** çdo lojtar merr **4 letra**; blinds, pozicionet, raundet (preflop, flop, turn, river), side pots, rake dhe radha e showdown-it janë si në Hold'em.
- **Rregulli 2 + 3:** dora duhet të përdorë **saktësisht 2** letra nga dora dhe **saktësisht 3** nga tavolina (`evaluateHand`/`bestHand` në poker.js provojnë 6 × 10 = 60 kombinime). P.sh. 4 zemra në dorë me vetëm 2 në tavolinë nuk janë flush; poker (4 njësoj) në tavolinë nuk mund të luhet.
- **Pot limit:** basti maksimal = pot-i; raise-i maksimal = basti aktual + pot-i pas call-it (`maxRaiseTo` në game.js). Shembull blinds €1/€2: raise-i i parë maksimumi €7. Minimumi si në No Limit. Serveri refuzon çdo shumë mbi limit ("Pot limit: the maximum raise is …"); butoni "All-in" bëhet "Pot" kur limiti është më i vogël se stack-u.
- **Ku shfaqet:** qendra zgjedh lojën kur krijon tavolinën (Hold'em ose Omaha); lobby ka etiketën NLH / PLO dhe filtrin "All games / Texas Hold'em / Omaha"; në tavolinë 4 letrat dalin si fan, rreshti lart tregon "PLO · Hand #"; forca e dorës preflop tregohet si "AAKK · double-suited"; inspektimi live llogarit shanset me rregullin 2 + 3; rregullat e Omaha-s janë në dritaren e rregullave.
- Testet: `omaha.test.js` (rregulli 2 + 3, 4 letra të fshehura, madhësitë pot-limit preflop/flop, all-in i shkurtër, showdown dhe ruajtja e parave) + kontrolle në integration.test.js për krijimin e tavolinës Omaha. Gjithsej 60/60.

## Auditim i plotë i logjikës (Hold'em + Omaha)
- **Vlerësuesi i duarve:** u vlerësuan të gjitha 2,598,960 duart me 5 letra; numri për çdo kategori përputhet saktësisht me matematikën (p.sh. 40 straight flush, 624 poker, 3,744 full house).
- **Përzierja:** Fisher–Yates me `crypto.randomInt`; 260,000 deck-e: χ² = 51.2 për 51 shkallë lirie (e drejtë, pa anim).
- **Fuzz i lojës së plotë:** ~45,000 duar të rastësishme (2–6 lojtarë, Hold'em dhe Omaha, rake 0–10%, raise legalë dhe ilegalë, fold, largime, pushime, rebuy): 0 humbje parash, 0 veprime ilegale të pranuara, 0 veprime legale të refuzuara, 0 duar të pambaruara, deck gjithmonë 52 letra unike, rake i saktë (pa flop pa rake), pagesat përputhen me një llogaritje të pavarur të side pot-eve. Një version i shkurtër u shtua si test i përhershëm (`fuzz.test.js`).
- **Rregullat e verifikuara:** blinds dhe heads-up, opsioni i big blind, min bet/raise, all-in i paplotë që nuk rihap bastin (TDA), side pots, bastet pa call kthehen, odd chip te fituesi i parë majtas dealer-it, radha e showdown-it dhe muck, runout rrugë pas rruge, time bank, timeout check/fold, Omaha 2 + 3 dhe pot-limit.
- **Mangësi të mbetura (jo gabime rregullash):** (1) nuk ruhet historia e plotë e duarve për ankesa/auditim; (2) inspektimi live i qendrës sheh letrat gjatë dorës — rrezik nga brenda; (3) rinisja e serverit gjatë dorës e anulon dorën (paratë kthehen); (4) rake pa tavan; (5) fjalëkalimet e vjetra në historinë e git; (6) `bots.js` (i palidhur ende) — botët kundër lojtarëve realë duhen deklaruar.

## Lobby me tab-e
- Në fillim të filtrave ka 3 tab-e: **Texas Hold'em**, **Omaha** dhe **Tournaments**, secili me numrin e tavolinave. Lista tregon vetëm tavolinat e lojës së zgjedhur; tab-i mbahet mend gjatë sesionit.
- **Tournaments:** motori i turneve nuk ekziston ende, prandaj tab-i tregon "No tournaments are scheduled right now" me butonin për tavolinat cash.

## Historia e çdo dore (te qendra)
- **Çfarë ruhet:** çdo dorë e mbaruar (Hold'em dhe Omaha): tavolina, loja, blinds, rake %, dealer, çdo lojtar me vendin, stack-un e fillimit, **letrat e dorës** dhe stack-un në fund (+/−), çdo veprim me rrugën, shumën dhe kohën (blinds, fold, check, call, bet, raise "to", all-in, timeout, largim), letrat e tavolinës, pot-et/side pot-et, fituesit, kombinimet, pagesat dhe rake-u.
- **Ku ruhet:** skedar më vete `hands.jsonl` pranë `state.json` (një rresht JSON për dorë, vetëm shtohet, nuk rishkruhet kurrë), kështu mbijeton rinisjet dhe nuk e rëndon databazën. Leximi bëhet nga fundi në blloqe, pra duart e fundit gjenden menjëherë edhe kur historia është shumë e madhe. Dosja `data/` nuk shkon në git.
- **Ku shihet:** Paneli i qendrës → **Hand history**: lista nga më e reja, filtra sipas tavolinës, lojtarit dhe datave, "Load older hands". Klikimi hap dorën e plotë: tavolina me letrat, çdo lojtar me letrat dhe fitimin/humbjen, historia tekst rrugë pas rruge (PRE-FLOP, FLOP, TURN, RIVER, SHOWDOWN, SUMMARY) dhe **Download .txt**.
- **Akses:** vetëm qendra (`/api/hands`, `/api/hands/get`); adminët, agjentët dhe lojtarët marrin 403.
- U mbrojt kodi i papërfunduar "Bots" në app.js (lidhet vetëm kur HTML-ja e tij ekziston), sepse pa këtë faqja ndalonte së ngarkuari pjesën pas tij.

## Botët që mbushin tavolinat (të ndershëm)
- **Qëllimi:** të mbushin vendet bosh që tavolinat të duken plot, pa mashtruar. Boti është lojtar i zakonshëm i ulur në tavolinë, me para nga qendra (buxheti del nga portofoli i qendrës dhe kthehet te qendra kur boti fshihet).
- **I ndershëm:** vendos vetëm nga `botView` = letrat e veta + ajo që shohin të gjithë (board, pot, bastet). Nuk sheh letrat e të tjerëve, deck-un apo rezultatin dhe nuk humb me qëllim. Testi `bots.test.js` provon që asnjë letër e huaj nuk hyn në vendim. Forca e dorës llogaritet nga letrat e veta (preflop Hold'em/Omaha, pas flop-it me vlerësuesin e lojës); respekton min-raise dhe pot-limit-in e Omaha-s; "mendon" 1.5–4 sekonda.
- **Menaxhimi i rrezikut (nga qendra):** buxheti, buy-in, **win limit** (kur fiton aq në një sesion ngrihet nga tavolina — nuk u merr kurrë shumë lojtarëve), **loss limit** (kur humb aq ndalon) dhe stili Low / Medium / High.
- **Vetëm mbush:** ulet vetëm ku ka të paktën një lojtar real, nuk zë kurrë vendin e fundit të lirë, maksimumi 3 botë për tavolinë, largohet kur ikin lojtarët realë ose kur tavolina mbushet.
- **Kush i sheh:** lojtarët i shohin botët si lojtarë të zakonshëm (emër normal, pa etiketë; snapshot-i i lojtarit nuk ka asnjë shenjë bot-i). Vetëm qendra i dallon: paneli Bots, inspektimi live (etiketa BOT) dhe historia e duarve. Rregullat e lojës thonë në mënyrë të përgjithshme që platforma mund të ulë "house players" që ndjekin të njëjtat rregulla dhe shohin vetëm letrat e tyre (pa treguar cili është bot).
- **Paneli:** Qendra → **Bots**: krijim, start/stop, ndryshim i konfigurimit, gjendja live (wallet + tavolinë, fitimi i sesionit dhe total), fshirje me rimbursim. Botët nuk mund të hyjnë me fjalëkalim dhe nuk dalin te llogaritë/transfertat.
- **Nuk u ndërtua (me qëllim):** sjellja "fiton pak, pastaj ia kthen lojtarit" — kjo kërkon që boti të humbasë me qëllim, d.m.th. manipulim i rezultateve (chip dumping).

## Pagesa me crypto (USDT TRC20 direkt në wallet-in e qendrës)
- **Pa ndërmjetës dhe pa çelës privat:** qendra vendos vetëm adresën publike të wallet-it (Paneli → **Crypto payments**). Serveri lexon blockchain-in publik (TronGrid) vetëm për transfertat e konfirmuara të USDT (kontrata `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`) drejt asaj adrese. Adresat kontrollohen me checksum (base58check).
- **Depozita (lojtari):** te portofoli në lobby → **Deposit** → zgjedh USDT; serveri jep një **shumë unike** (p.sh. 50.37 USDT), që e lidh pagesën me atë kërkesë — askush nuk mund të marrë pagesën e tjetrit. Kontroll automatik çdo 30 s (dhe "I have paid · check now"); krediti në € = USDT × kursi i qendrës, nga portofoli i qendrës te lojtari (ledger `CRYPTO_DEPOSIT` me hash-in). Kërkesa vlen 3 orë; maksimumi 3 të hapura; një transfertë kreditohet vetëm një herë.
- **Transferta pa depozitë** (shumë e gabuar, vonë): dalin te qendra për t'ia kredituar lojtarit të duhur ose për t'i injoruar.
- **Tërheqja (lojtari):** shuma në € + adresa TRC20; krediti bllokohet menjëherë; qendra paguan nga wallet-i dhe shënon **Paid** me hash-in (krediti kalon te qendra) ose **Reject** (krediti i kthehet lojtarit). Një tërheqje e hapur për lojtar; chips-at në tavolinë nuk përfshihen.
- **Konfigurimi i qendrës:** adresa, kursi i depozitës dhe i tërheqjes (€ për 1 USDT), minimumet, aktiv/joaktiv. Opsionale: `TRONGRID_API_KEY` në Coolify për limit më të lartë kërkesash.
- Testet: `payments.test.js` (checksum adresash, vetëm shuma unike kreditohet, pa dyfishim, token/rrjet i gabuar injorohet, skadimi dhe caktimi manual, tërheqje paid/reject me ruajtjen e parave, të drejtat). 70/70.

## Menuja e llogarisë (avatar smerald)
- Në vend të "Sign out" në header ka një **avatar smerald**; klikimi hap menunë me emrin, rolin dhe portofolin, pastaj opsionet të renditura: **Deposit** (me etiketën USDT ose "soon"), **Withdraw**, **Transactions**, **Hand rankings & rules**, **Change password**, **Sign out**. Stafi sheh **Management panel** në vend të opsioneve të lojtarit; qendra edhe **Crypto payments**.
- Deposit/Withdraw duken gjithmonë (edhe te kartela e portofolit në lobby); nëse qendra nuk i ka aktivizuar pagesat crypto, lojtari sheh "Coming soon · contact your agent".
- **Transactions:** historia e portofolit të lojtarit (krediti nga agjenti, buy-in/dalje nga tavolina, depozita/tërheqje crypto). **Change password** tani edhe për lojtarët.
- Menuja mbyllet me klik jashtë ose Esc; në celular hapet në gjithë gjerësinë.
- **QR code:** te depozita lojtari sheh QR-në e adresës së wallet-it (skanohet me çdo wallet celulari); shuma unike mbetet e shkruar e madhe sipër. Te "Withdrawals to pay" qendra sheh QR-në e adresës së lojtarit për ta paguar duke skanuar. Gjeneruesi është i yni (`public/qr.js`, ISO 18004: byte mode, nivel M, versionet 1–10, zgjedhje automatike e maskës), sepse politika e sigurisë së faqes nuk lejon skripte të jashtme; `qr.test.js` e verifikon me vlerat zyrtare (Reed-Solomon "HELLO WORLD" 1-M, format/version info, alignment, kapaciteti).

## Rake-u dhe botët
- **Paratë:** botët paguajnë rake si çdo lojtar (loja është identike për lojtarët realë) dhe ai rake shkon te qendra. Çdo regjistrim RAKE shënon pjesën e botëve (bot: true).
- **Ndërprerësi "Include bot rake"** (vetëm qendra, te **Revenue** dhe te **Rake**): i fikur = shifrat vetëm me rake-un e lojtarëve realë; i ndezur = shtohet edhe rake-u i botëve (te Revenue si grupi "Bots (house)"). Ndryshon menjëherë, edhe në rifreskimin live; pranë tij del shuma e botëve ("€X from bots not shown" / "incl. €X from bots"). Zgjedhja mbahet mend në atë browser.
- **Adminët dhe agjentët** shohin dhe marrin përqindje vetëm nga lojtarët e tyre realë; botët nuk u përzihen kurrë.
- **Paneli Bots:** chips, rake i paguar, rezultati për shtëpinë (chips + rake).

## Letrat statike
- Kur hapen letrat (flop/turn/river, showdown), kur shpërndahen letrat e tua dhe kur bën fold, numrat dhe simbolet nuk lëvizin më: letrat e hapura shfaqen në vend me një fade të shkurtër, pa rrotullim 3D, zmadhim apo zhvendosje. Vetëm letrat me shpinë (pa simbole) vijnë nga dealer-i. Letrat fituese kanë një shkëlqim statik (pa vijën që lëviz) dhe kufiri nuk ndryshon trashësi.

## Çfarë i mungon platformës (analizë)
**Kritike para parave reale:** (1) faqet Terms of Service, Privacy Policy dhe Responsible Gaming; (2) backup automatik i `state.json` dhe `hands.jsonl` (sot vetëm një kopje në disk); (3) "Forgot password" — llogaritë nuk kanë email/telefon, fjalëkalimin e rikthen vetëm menaxheri; (4) 2FA për qendrën dhe adminët (qendra kontrollon paratë dhe wallet-in); (5) fjalëkalimet e vjetra në historinë publike të git; (6) mjete loje të përgjegjshme: limite depozite, self-exclusion, kujtues kohe; (7) kontroll moshe/identiteti dhe licencë sipas vendit.
**Të rëndësishme:** historia e duarve për vetë lojtarin; lista pritjeje kur tavolina është plot; shumë tavolina njëherësh (sot vetëm një); turnetë / Sit & Go (tab-i ekziston, motori jo); njoftime (Telegram/email) për depozitat, tërheqjet dhe tavolinat; mute/report në chat; strategji më e mirë për botët; databazë e vërtetë (SQLite/Postgres) në vend të një JSON-i që rishkruhet i tëri në çdo ruajtje.
**Të mira për t'u pasur:** foto profili/avatar; statistika lojtari; VIP/rakeback; ante/straddle, PLO Hi-Lo; aplikacion PWA me service worker; disa gjuhë (anglisht + shqip).

## Disa tavolina njëherësh dhe lista e pritjes
- **Deri në 4 tavolina** për lojtar (`MAX_TABLES`), çdo tavolinë me buy-in-in e vet; jo dy herë në të njëjtën tavolinë.
- **Kalimi mes tavolinave:** vetëm kur lojtari është në 2 ose më shumë tavolina, në tavolinë del shiriti me tavolinat e tua (lojë, emër, stack) dhe "＋ Table"; në lobby "Your tables". Kur të vjen radha në një tavolinë që nuk është në ekran, chip-i i saj ndizet në ari me "YOUR TURN", titulli i tab-it pulson dhe bie zilja (nëse tingulli është ndezur). Kur kthehesh në lobby mbetesh i ulur.
- **Prania:** sa kohë një tab i lojtarit është në ekran, të gjitha vendet e tij llogariten "present" (nuk kalon "away" në tavolinat e tjera). Rregulli i timeout-it mbetet: nëse nuk vepron brenda 30 s kur të vjen radha, bën fold/check dhe kalon në pushim.
- **Lista e pritjes:** te tavolinat plot lobby tregon "Wait for a seat · N" (ose "#2 in line ✕" për t'u hequr) dhe "Watch". Kur lirohet një vend, mbahet 45 s për të parin në listë: del njoftimi "A seat is free at … · Take the seat" me numërim mbrapsht; askush tjetër (as botët) nuk e zë vendin e fundit të lirë gjatë asaj kohe. Nëse nuk e zë, vendi i shkon tjetrit dhe ai del nga lista.
- Testet: `waitlist.test.js` (4 tavolina, radha, vendi i mbajtur, skadimi, dy vende të lira). 77/77.

## Dritarja "Out of chips" (rimbushja në tavolinë)
- **Hapet vetëm një herë** për çdo rast pa chips; pasi shton chips (ose largohesh) nuk rihapet më nga përditësimet e vonuara të tavolinës, dhe mbyllet vetë kur nuk vlen më.
- **Gjithmonë e saktë dhe e përditësuar:** tregon **wallet-in** (rifreskohet çdo 3 s, edhe pas një depozite crypto), **sa ke në tavolinë**, **sa mund të shtosh** (nga 1 big blind deri te maksimumi i tavolinës, jo më shumë se wallet-i) dhe numërimin mbrapsht. Shiriti lëviz vetëm brenda kufijve të lejuar; butonat Min · ½ · Max.
- Nëse wallet-i nuk mjafton: mesazh i qartë + "＋ Deposit to my wallet"; edhe butoni "Leave the table". E njëjta pamje (wallet, stack, kufijtë) edhe kur ulesh ose shton chips me "＋".

## Botët: strategji e re + mbrojtje e shtëpisë
- **Nuk ka bot të ndershëm që nuk humb kurrë**; boti nuk sheh letrat e askujt dhe nuk manipulon rezultatin. Mbrojtja e platformës bëhet me tre mjete:
- **Strategji me equity:** boti llogarit shansin e vet të fitores duke luajtur dorën qindra herë kundër letrave të rastësishme (vetëm letrat e veta + board-i janë të njohura; letrat e kundërshtarëve nuk shihen kurrë) dhe e krahason me pot odds + një diferencë sigurie; vë para vetëm kur ka avantazh matematikor, bën bet për vlerë me duar të forta, bluf rrallë, nuk rrezikon pjesën më të madhe të stack-ut pa dorë shumë të fortë. Simulim (€/100 duar, €1/€2): kundër lojtarëve që bëjnë call shumë Hold'em +594 → +1625; kundër agresivëve −531 → +6480; kundër lojtarëve të disiplinuar afër barazimit (−120 → −235, me luhatje të madhe).
- **Mbrojtja e shtëpisë:** limit ditor humbjeje për të gjithë botët bashkë (chips + rake i kthyer te qendra, ditë sipas orës së Tiranës). Kur arrihet, të gjithë botët ndalojnë dhe ngrihen; nesër nisin vetë. Paneli tregon rezultatin e ditës dhe gjendjen.
- **Modaliteti "Seat only":** boti ulet dhe mbush vendin, por kalon menjëherë në sit-out para çdo dore — nuk paguan blinds dhe **nuk humb asnjë cent** (test me 80 duar).
- Testet: equity (AA ≈ 85%), seat-only 0 humbje, limiti ditor ndal të gjithë botët. 79/79.
- **Rregullim kundër all-in-eve (pas testit të qendrës):** boti nuk bën më fold të tepërt kundër all-in: paguan kur shansi i tij kalon çmimin (pot odds); pasi ka futur ≥ 1/3 e stack-ut në pot "mbron" chips-at; mban mend kush shkon all-in shpesh (nga veprimet që shihen nga të gjithë) dhe kundër tij vendos vetëm pot odds. Bluf-et janë të vogla (≤ 10% e stack-ut) që të mos humbasë shuma të mëdha. Matje pa fat (EV, heads-up €1/€2, €100): kundër "all-in në çdo dorë" +327 → **+741 €/100 duar** (paguan 55% të rasteve në vend të 18%). Disa duar mund të humben gjithmonë nga fati; limiti ditor i shtëpisë mbetet mbrojtja e garantuar.

## Tab tjetër ≠ largim
- **Problemi:** kur lojtari kalonte në një tab tjetër, faqja mbyllte lidhjen live; serveri e merrte si largim dhe pas pak sekondash e nxirrte "sit out" — me dy lojtarë dora nuk shpërndahej më.
- **Tani:** lidhja live mbetet e hapur edhe kur tab-i është në sfond, dhe çdo lojtar me lidhje të hapur llogaritet i pranishëm në të gjitha vendet e tij. "Away" ndodh vetëm kur faqja mbyllet ose interneti bie.
- **Limiti kohor:** kur skadon koha e veprimit, timer-i bën check (nëse është falas) ose fold për lojtarin dhe loja vazhdon — nuk e kalon më në pushim. Nëse ndodh në 3 duar radhazi, vendi mbyllet dhe chips-at kthehen në portofol (paralajmërim në tavolinë: "Timed out: x/3 hands").
- Verifikim: lojtari me tab-in e fshehur për 75 s nuk kaloi asnjëherë në sit out dhe duart vazhduan. Testet 81/81.

## Tingujt e tavolinës
- Skedarët e qendrës në `public/sounds/`: `fold.m4a` (fold, edhe automatik), `check.m4a` (check, edhe automatik), `bet.m4a` (call, raise, bet, blinds; edhe më butë kur chips-at shkojnë në pot), `allin.m4a` (all-in dhe kur fituesi merr chips-at e pot-it), `card.m4a` (çdo letër: secila nga 3 letrat e flop-it, turn, river, shpërndarja dhe hapja e letrave).
- Ndezja e tingullit nuk luan asnjë tingull vetë (më parë luante "check" si konfirmim, që dilte sapo hyje në tavolinë). Blinds-at automatike (SB, BB, post) janë pa tingull; call/raise/bet luajnë "bet" me volum të plotë. Kur tab-i nuk shihet, tingujt nuk luhen. Verifikuar në browser duke regjistruar çdo tingull gjatë hyrjes dhe disa duarve.
- Tingulli është i ndezur si parazgjedhje dhe nis me prekjen e parë (browser-at nuk lejojnë audio para saj); lojtari mund ta fikë te "⋯ → Sound" dhe zgjedhja mbahet mend. Ziljet "radha jote" dhe "koha po mbaron" mbeten si më parë.
- **Tingujt vetëm në tavolinë:** audio ndizet vetëm kur një lojtar është brenda tavolinës. Home page, hyrja/regjistrimi, lobby dhe paneli i qendrës/adminit/agjentit nuk krijojnë asnjëherë audio dhe nuk luajnë asnjë tingull (verifikuar me klikime reale).
