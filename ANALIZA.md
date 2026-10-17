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
