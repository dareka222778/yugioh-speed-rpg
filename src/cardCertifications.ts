// Explicit certificates from separately reviewed/tested cohorts. Import alone never promotes cards.
// Fingerprints detect changed mechanics; CI must also execute the referenced suites.
import type {CardCertificate} from './cardRegistry';
export const cardCertifications:Readonly<Record<string,CardCertificate>>={
  "82828051":{"fingerprint":"9614382d160247ae3cf9ebdbe8b81e490ef140c379829fd1787f8592cddebc62","suites":["tests/positionBatch26.test.cjs"]},
  "59744639":{"fingerprint":"11a51cd1af09184e27ad504a8e34e558a576b83d84850336d64c1c1853d881a4","suites":["tests/positionBatch26.test.cjs"]},
  "83133491":{"fingerprint":"05746cd06be05aac24881a4247c92a1207ef3f9a2122ec0b3ddd02864a8463b8","suites":["tests/positionBatch26.test.cjs"]},
  "31785398":{"fingerprint":"443ac51498ffe5c76f7b00db3b889a9d3f323727693780e6559e3447f0d29044","suites":["tests/positionBatch26.test.cjs"]},
  "73628505":{"fingerprint":"a59f760372ad8651a81311c763861c92d4de37768f59b34b2109cfe503533851","suites":["tests/searchSpellBatch25.test.cjs"]},
  "32807846":{"fingerprint":"5af969bfa4a28e4cc73e9280dca281b3eb90718d7f77ed1994f93591ff5778de","suites":["tests/searchSpellBatch25.test.cjs"]},
  "26902560":{"fingerprint":"d408583b8d2585f85e761a00f9144d3aaddbe3ab64e5ca559d6a770575e32c42","suites":["tests/searchSpellBatch25.test.cjs"]},
  "95281259":{"fingerprint":"1785aaac21c47b33e856ebe384800e88f39031ee8fdd6551334b5447b869dab8","suites":["tests/searchSpellBatch25.test.cjs"]},
  "89997728":{"fingerprint":"c9ce54e9346a4bb47ec5479eda8d1ae300fb67c9280a8651f4ab192b717dfa28","suites":["tests/searchSpellBatch25.test.cjs"]},
  "06390406":{"fingerprint":"37a4601e4dc1953f548239e25484017155338c1d1d223b69d2b914d94f6f0d8f","suites":["tests/searchSpellBatch25.test.cjs"]},
  "99518961":{"fingerprint":"0f942d1998a3dd33089cfd4cc6b4349cb2e0282a9e5d9706d8806185a00cf866","suites":["tests/economicCountBatch24.test.cjs"]},
  "27053506":{"fingerprint":"7b9891c069cfae62aba900a16d36208ede256a05b3a0dff02b3f17cdcd78eacf","suites":["tests/economicCountBatch24.test.cjs"]},
  "51394546":{"fingerprint":"cbe35c4c0b88ff8d7fcbcbc2bde06f828760c3616f26259c97019b68e3d97c8c","suites":["tests/economicCountBatch24.test.cjs"]},
  "98299011":{"fingerprint":"9f0da84ed0d0ba609ee57b73d79d0387235ed9bb2331220215307d804366ab32","suites":["tests/economicCountBatch24.test.cjs"]},
  "44472639":{"fingerprint":"630d110bb78fff689f4ed5663e51f21b01eb917009d247254ccafd929ee41030","suites":["tests/economicCountBatch24.test.cjs"]},
  "58074572":{"fingerprint":"5bc33794ffec7b0182e28cdd9d5c74ac1f8c1e8dae482af83a359442f811e44b","suites":["tests/economicBatch23.test.cjs"]},
  "08842266":{"fingerprint":"5a4a4786e3c0bd0632bd77810cf3fc15143054140b5e7d66b0d01e77a88835b8","suites":["tests/economicBatch23.test.cjs"]},
  "10071456": {
    "fingerprint": "b4f9a0cdce80d9cf807d753366db8a35587dbc8b971f1c6be0fb4ceb8df382bb",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "10202894": {
    "fingerprint": "a5213988a81dd120d8291fa521dda7799d0ccb469c867c61d34dda5eceb63067",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "10262698": {
    "fingerprint": "6b2e9b31030f161c4799a3c4bddb03811fb8b5fd964415ad512f8594369e54f5",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "10315429": {
    "fingerprint": "6f844ae506645e97b16ecb70a4e6be89a7d41daac30b464348f4c272e3eb32a5",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "10476868": {
    "fingerprint": "575ad7a1d3cf635098af6268e9c2cceb0a3711af6d0ef59f6d4b75c2229250f1",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "10538007": {
    "fingerprint": "af3e6260307c487a37ca71cee6b7e9f1aa6ad6f2674b76529b8a77b75c4e97ed",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "10598400": {
    "fingerprint": "9329c90cda7bba164a711802261a5e163eb0f3a5e8bc13223f3201f7c7ddd313",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "10859908": {
    "fingerprint": "30485132a6c36a5860671a17d7c98e212eba68a3180f566be5dd6cd7da34594e",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "10992251": {
    "fingerprint": "d004a25d295fdcb4a9ba96c4fad07e8a88e9588a068767d010d0898297606355",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11091375": {
    "fingerprint": "3ac7756ddab392e1d064f6e83f8b7aefde57a9449a27306419b1d95fa91f0baa",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11250655": {
    "fingerprint": "f44281183127bd74eb61298c309d82bf9ac653d748eac0486bad675100d4add7",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11321183": {
    "fingerprint": "748d6a4838a50d3666b3ef70498ebeac3467b407d1014ec75885548cb8db11b9",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11384280": {
    "fingerprint": "5e40056686936320fa9e152aec2f2ad79beb09e29fce1f2a324e805fa99e2dbb",
    "suites": [
      "tests/classicIgnitionEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "11549357": {
    "fingerprint": "66c61f2e268f4f1a9ffeaf92e6fd527a2f45223b2416158d492093893913936a",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11714098": {
    "fingerprint": "f41a6de2b74978a4b35cadb2f67282b02c273bad0255c69a1405ad58d442f355",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11761845": {
    "fingerprint": "83adf7a187adca17fcf399556ef85028b57e0ae47fee030e913f8ba38b426fa4",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11793047": {
    "fingerprint": "2cde8fcb0351989ef85c7edf2470ec9c787cb544a4bfe214f31bc72ead41ef7c",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11813953": {
    "fingerprint": "3106f948908c70cb5be5651f8ac07a8b3c98006a62a03289fee320c831623de2",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "11868825": {
    "fingerprint": "eb769319944fecdb4aeedf8593482b53312f1cf5a58b1e7bd387f9a4c440ffa1",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "11987744": {
    "fingerprint": "deb1a73aa79f5f7fb44ab0dc5d6ac533abc4f682b9cfee9feae68de4377b2cc7",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "12057781": {
    "fingerprint": "df8684a649b00367880a10d172f37da9145918308950108da4e41c212d493ccb",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "12143771": {
    "fingerprint": "e6f0d3a315f0ce7507616434d30653eb79a66bfc31d4dd3714614096c8737ee4",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "12146024": {
    "fingerprint": "a8f488ced4426484e75ce6551c1f76c9efbaaa06970d386db53c11aae2981ffa",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "12436646": {
    "fingerprint": "fcec0aa522e47fbf3834ca79eb0713c5a4f0ac3814aa811f5ef700ab2f44169f",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "12472242": {
    "fingerprint": "ee84813a21a7ada1888a0cb510791cc9a506a54d42ec1cdcc31e1bc474452eec",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "12482652": {
    "fingerprint": "d9c81feb3267b5c336882eb2c6f6ba7fc9c16a952fae920b851f080dcc784222",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "12493482": {
    "fingerprint": "7c3dd6ffe8ba617bb24067106d6b5963b7323d66209fbb077cb15032e2a2090c",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "12580477": {
    "fingerprint": "2f3824336d537d8f88a42b71d85b9d2014722a7c1a5db92076132057363675d4",
    "suites": [
      "tests/classicSpells.test.cjs"
    ]
  },
  "12607053": {
    "fingerprint": "f6a74008d95bd3c5b9efff2eff704ed689e281c21c19f77a19d2cfa0c262f9bb",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "12829151": {
    "fingerprint": "81a114e1b9e7dae0bafd38703113578f5560b52f210ad866d72730755cf84251",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "12883044": {
    "fingerprint": "f7f6f1f12b1944a6becbed82d271e4ee10172511a6317b024aaa8437fe0ab443",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "13039848": {
    "fingerprint": "fff21d0d1c150df4014bbaecba3e9ff19bebe6a8cc7030052f6963429e72eeb9",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "13069066": {
    "fingerprint": "dd9b07d672674d7947a6cfd3725a1440276ab37b25094eb29a6e4fd1abdcfdb1",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "13179332": {
    "fingerprint": "19b2c4f547304a7d309ca21bc6a6012af68770dbb55a5a2ddcb91249059db040",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "13193642": {
    "fingerprint": "888854c521bfd1eaa6ec89ff658d9d01a1e805f2c72e969e20be06d9d9fb695c",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "13429800": {
    "fingerprint": "bec773ed4e3e5d565aa6be895c98d9f5b55b930b5ee0aa4a73706260a1dbf6c8",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "13676474": {
    "fingerprint": "e20c00d14ec9562e6df1dc3b566335dafbf9d6b1b0f621dd1dbafcdaa44b7650",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "13723605": {
    "fingerprint": "36c5f2719c44ebb69040c3026c3cf2b9becf50c9aeff2331906d718ae3c599dd",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "14015067": {
    "fingerprint": "cfd3f5f242c7fdc4a2c9bb5c325754d64edaeeb677ef1e7651a6445c5ee6daf3",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "14037717": {
    "fingerprint": "8839ac3bf5f3d24903bc461e6ed56aa2a41840e842101a214ef69c8b5712111c",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "14087893": {
    "fingerprint": "39278c3f786f1f0279c8e3db1a3f7f4fe62ba6ff0e17dc1cecfe50ed546e443b",
    "suites": [
      "tests/classicSummonResponses.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "14181608": {
    "fingerprint": "98af9cded0e24d80ffcc410111e8012db65691e5eb8ee6353dd6d5de5e052d2e",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "14315573": {
    "fingerprint": "fe60baa78ea8979959cefe3edf906bcec2e60be405e850efda0f313c05fa40b7",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "14531242": {
    "fingerprint": "e7ca307c246393c35983f3a84976409d38ca20b03a82d5535a9f3ed11d13f530",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "14708569": {
    "fingerprint": "d75f89a70877798bb5f9510826aa911b4807ce266c8d19899fe9378d245b63f6",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "14851496": {
    "fingerprint": "7ef4f8f593ef8ab38627442c44f7162b6c4fffa850350bcc090fd7996de6846e",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "14977074": {
    "fingerprint": "232b9c0ffc20423a2b66dfbfd0c0fcfc613e0be1c6f3be5b958fcfc7af0e6b5f",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "15023985": {
    "fingerprint": "76a3624c8fa58a86236f486770625b1f09ff8373eeebcea1c269334eefe198ea",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "15025844": {
    "fingerprint": "287128311e86463cc29ad1b674e67d444c2a308b576eceb2f4add494a65eb5af",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "15042735": {
    "fingerprint": "91fe5e055c5c3574bef18bcdbe037d0c7ac4c13f3a4340ccb7a02416eab64edb",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "15052462": {
    "fingerprint": "59810ed274fb820061a6226c1649ffea15a02dad178a198ed338406ac7f63bc3",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "15150371": {
    "fingerprint": "a64e5360bb1cfde4b13d1edc0ca817a9b8a3e5073442e3173917e232d9bc047e",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "15237615": {
    "fingerprint": "85ba0949a2f023150bf6f87dc414da7c33060d7f440ecf3d9d0c743f58b17941",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "15303296": {
    "fingerprint": "1410509fe2fd484cb6455444ad42aebbb7c87bab7dd3d3b16d90a6e943c3e9ee",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "15367030": {
    "fingerprint": "b2c901b67e778234da8f1d0aeb32b0caf483742253e6cd8d47bfb8034f3b3f4d",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "15401633": {
    "fingerprint": "2a3f6889a420f8aac29d19acb5a2c499dd13808c3fd5c9a38e520fa333c44b57",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "15480588": {
    "fingerprint": "094c0e1b1af822f438298f3eddbf179457f3d0827c588f025ad47fe1ebb5528c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "15507080": {
    "fingerprint": "1435da21d47fab89977e9b0369403a4aa2a71ff2ca43da085880e5075eff76fd",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "15510988": {
    "fingerprint": "4b368ed0e8de9b543632117aef82c54a8db40d36fa52b3b253cf7aafb394ab26",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "15734813": {
    "fingerprint": "b88f6294d0e01fe986fc38f4461093f1424b5b3f3cf4a5ac410e861e5e492025",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "15820147": {
    "fingerprint": "b62d4a3689bafdcd0cab090b3dc7e8055dd0003addcdac057beef59cb1f617e8",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "16246527": {
    "fingerprint": "1f71cf5aac8b1457f5dec7119c39780e1c08abfbadf449f2e423b8ded4a017aa",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "16353197": {
    "fingerprint": "6a9035cef0514cfd0c0f1a5aa33f89ded5651dccbc76d7008a57d5554374a1e1",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "16430187": {
    "fingerprint": "932c2c8031387be489c109aadd32dbf157373caef7652523fc82f92f8b2223ad",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "16507828": {
    "fingerprint": "5e98d7bfafda2860681ebbb232fb4b59c109690c877896cc650cfdbf611ebee2",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "16587243": {
    "fingerprint": "c4f999bb9df690ff4ee79f9bafccdcf8363bd47b23612399f71c6f07a298a311",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "16899564": {
    "fingerprint": "d4be198d36fb61513952c86534c223028eaad331c7ee031e2aaa0acd9ec9bd8d",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "16972957": {
    "fingerprint": "ac65d585da147aac37365efc72279c55090c135b81e4e69168e5efff4866d50f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "17115745": {
    "fingerprint": "c98a8c7cff50fcb13ce8222d8cb1669a9fc79bf9e86be3895dbad8d016274c53",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17192817": {
    "fingerprint": "63d5e2207b78094f9eff6a4b9a54536a349b2d7af3187da984cf889624850be2",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17238333": {
    "fingerprint": "04c65bb4015b83f577cc2b10db47486b544ddb4d7e3e1d9e8c0bb73294f7b718",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17358176": {
    "fingerprint": "2a9eca51fa944482592d7700b79893170af0b3177d50a8dcd9e9f143af4572f5",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "17441953": {
    "fingerprint": "df2838566ac1c3852718d9ee131734d8e13c73902528485fcf9b10f2b5198c43",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17511156": {
    "fingerprint": "39f5fbca49c541bccbdc18826d16e1e66537336f87bbd8e93bffaa2d2171c985",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17535588": {
    "fingerprint": "27510601a2136bd1ebadb92c73e10d0ba5c6c766e92ebb5b9a0b4ae9a7f2d1bb",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17658803": {
    "fingerprint": "8621c294d905fc99be6daa40e05ef3943b071ba13cd496ea17e8e20a1569bab6",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17733394": {
    "fingerprint": "9bca7a2334569cd3844b7d6c8e178ec78ac89d6012157bcbf4b11162885d98d7",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "17814387": {
    "fingerprint": "4c99b187a9a3f80aefdd9dd4362d17a57fb6ed887d7833b582d02b515bf605b7",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "17881964": {
    "fingerprint": "6a35869312f93e87bb45a2d522ce7e59d054d9dc44035307ad0a245a9ee725c6",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "17968114": {
    "fingerprint": "94dc8e86e5c2ccb0a564a1e4fedb2ac6ca2ead6757d71ca81a2fb817915a72cf",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "18144506": {
    "fingerprint": "6d30b80551538d631adc7e81297b0dfe10ac358125b37d20e2141e2dc4c565ed",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "18161786": {
    "fingerprint": "fd8156d5c2ffb8bc9e904a0fa06c767c7bd21aef20070abe46edd8fd771fdf72",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "18180762": {
    "fingerprint": "1ded3f9353fdca781791be8ee02b05c3af871ee0536b1388b0ad6537597ac516",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "18246479": {
    "fingerprint": "e41096ce92f720d008d12b176f6ef0c59d04ce071b55462891437960350cdd3d",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "18710707": {
    "fingerprint": "b30dc7e4950bde556c71d5608bbfd10ea00e9d3712762433e79f1d727ab718dc",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "18914778": {
    "fingerprint": "d51fdb7393d72b36a49008e383debdb5e4624cbc918fe3abe8bee98508f5a1e8",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "18937875": {
    "fingerprint": "5f94c296b840f2207c843807789e189dcc2c53d095067664ead1f4c8f3fa314f",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "19066538": {
    "fingerprint": "f049b3a3fec15e8d14df97fda41ed2177fbf85876c97157c6fd11b889c4cfdf5",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "19159413": {
    "fingerprint": "e0bebb9034111e0393d48e0dfdf1937a26dad6211ef5f294726db2d9556e0684",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "19384334": {
    "fingerprint": "2d80a194417629be44cccc971be7725c1d776c6c9ba2a07586f2c9716d7ae3e5",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "19523799": {
    "fingerprint": "34162147ba1f7fab2e3333ae5958990725a3901c5ef25a919b07da8e69475c0d",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "19613556": {
    "fingerprint": "51ba04b7028ff9debaca6cc1a48d7734d369888e4de31532c8fbf9795389a189",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "19737320": {
    "fingerprint": "64bdb0ce217eb171a5e52b98ce76d8d49b4e937a5fcce5cf3206822f57b96b9a",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "20060230": {
    "fingerprint": "46c8ccbdcd6be33c0a0e448410592c2f6cf2a022cccde115bc2e8119f5a2fc32",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "20065549": {
    "fingerprint": "329526b0976ba7eed5d1e3db5db4e700d0d6780535da7e17d71e426bb8b2cfd8",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "20277860": {
    "fingerprint": "95c22ff6757e6b75a70b1894700f97c02bc14c3046d9e0e0557135a7e9b0b5da",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "20315854": {
    "fingerprint": "35c388adfa639cac8900d03d9152b6aeade28ae999b3bc2d912c8ec95202a41b",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "20541432": {
    "fingerprint": "40894e268ed0961fbe643a515571eb324d66bea193ac0f06861aa8526fde4c8d",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "20624263": {
    "fingerprint": "b99a52d2d0781e3a2300fcfa1f1dee5f306d20b59742d65d4901c031f2dd93af",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "20831168": {
    "fingerprint": "143965b65578b0802bb2a975b33f6c6c4d0353edb50a9359b76d1bc2167e2410",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "20848593": {
    "fingerprint": "c1e3578ab452efd5fe8a2060a86f14391e67b83c7b7d0c35b968fe3bcd3ff877",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "20871001": {
    "fingerprint": "51f4962a5c67956cd31a74081232454291972786db9503acf3005d9a4641eb7a",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "21239280": {
    "fingerprint": "b710f6e0d314d63315210e43cc45ab5ab32b89bcb0ee87d92e4bfaa3aa04173f",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "21263083": {
    "fingerprint": "dcad82700b57ed2ea174663903a83826218219b16853328c21647ba4d18167a8",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "21297224": {
    "fingerprint": "dbf99725ee3326c8d98cd6a9c0d7734d737a1149000b7dc5f0440e2bac5266ab",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "21347810": {
    "fingerprint": "f8ddf63517b4e35acd59f37d40828250224fc9ea15158bfab4f2acd5834ba3f2",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "21817254": {
    "fingerprint": "995939c97138f73d750fe71b264e612aa51da4d2000a4ab5498f19b40a6543f2",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "22026707": {
    "fingerprint": "ba81237031c2427d864490d540e2e152bdcb725fed15621554c187e928764e3d",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "22702055": {
    "fingerprint": "8e7a86adc1cd83bb06165962eb323f2664a601b1e5fd52a1a4e983b338b711f3",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "22855882": {
    "fingerprint": "794a807c123af7b0115d808d89769b6decd70cc440f156b439baa3c59cd38cf5",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "22910685": {
    "fingerprint": "f572b7dda3997de87beaee16abda0c433762d0ca0a09f7e80720073e80a1415f",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "23032273": {
    "fingerprint": "4946e8ca652fb04b6008e04d1761d57119a0f5ba365c31bf25e5c026da570e4a",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "23424603": {
    "fingerprint": "355e49dd42d5610a9d3698466fbbf57f917f833f26a7a273cefcba0265a35a27",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "23659124": {
    "fingerprint": "ccbad6c56f28b98488b27806d1f6a30bee9b50f43bd46caa3cb66bb4f5712959",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "23771716": {
    "fingerprint": "7edd7f2180f492a6935d94aca8266ced33718a36c559f6f4de2d20f69a76285c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "24068492": {
    "fingerprint": "6d106695d590e6b221f3b5461135b671da249135ab693b91c0e5f9663da32f1b",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "24094653": {
    "fingerprint": "b1bf130eac464fcfae62c26b8ed5a70c3c6c955406158e619ce78f47c6bfd61c",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs"
    ]
  },
  "24194033": {
    "fingerprint": "9c719207647cd82cc955fa1984f81e31ced66dd06ede84e6de4ca42a033220b7",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "24311372": {
    "fingerprint": "e45ed97f6ad9b8c299687f51a25cd2f6ad8d7962b7a2189fe4d2723022699f2a",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "24348204": {
    "fingerprint": "1bc3f488d8a7e9230a58decd9ee747331a662107504c777f06cfbb56cb0665a8",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "24433920": {
    "fingerprint": "03962025eeadb9b40418e09ad99b42e0ac78caf4ce4f2628ce62cf4386837dff",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "24530661": {
    "fingerprint": "3d1af251cf98f99246857101bdb73db4bcb69adee1efa6a068937f2bd444b243",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "24611934": {
    "fingerprint": "3f32c5959be98f476e57d136da562395c2f5b6f0fddc22557ebd2cb9773806ea",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "25652259": {
    "fingerprint": "404623db6be5153ca77cbe6a637186a1c80c75cdcb78987e093775acc81920e9",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "25769732": {
    "fingerprint": "c4eb8cbcbac934285400c5863fc91590a6a711a424af3b7deac5091466bb2c1a",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "25880422": {
    "fingerprint": "e4b71ca98c461761f89a166fef7ece6a2c417a19f3960c65bccf8d3de6f43b41",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "25882881": {
    "fingerprint": "9444efa17e5c7a7368b9d5b33332caec8dd10350698bb9b928d3b10e90f66a01",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "26202165": {
    "fingerprint": "56f4b7c0ea7d5bd0c767294afd3da73478d38b334cb3be0bd60fc7c2d2359982",
    "suites": [
      "tests/classicGraveTriggers.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "26378150": {
    "fingerprint": "ba18ac7c59bd6b5ef6acd498fad6f1f262338890b9b2d189ace12b0cd7c5f089",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "26566878": {
    "fingerprint": "212c60a6d754686b6149a9f0d8ecb8885a55dd956454472e7249e65b8fa9543a",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "27054370": {
    "fingerprint": "63dbc32e9b324ea4066a89bf548447cabd7871c75db9dab220373f48e02dfc58",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "27094595": {
    "fingerprint": "71d41019772ef58c02ff213a81059f136929fba5d1454215134de139c2db5de9",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "27125110": {
    "fingerprint": "ddf6186b715e197e18bf77a547514726420ea45b68cc39ebf9a2d371079ada0c",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "27288416": {
    "fingerprint": "06a011ea71ae64df9eec76dc4ed6dc4561e00b913062bfe8c3f89cc82ffc0723",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "27324313": {
    "fingerprint": "a6c1a29b2582411e77f0d39c238176985cc96f0b939659a6363ee0bc5f3ba542",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "27671321": {
    "fingerprint": "fde446719392dfd668bab2536a286cc2d80a0217a2f396cbe8c6bcb401116aeb",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "28003512": {
    "fingerprint": "17b5f82cf38089a6cd9b12fce84f4ad8997f9607fb1da5fed3cf506c3fc4ff9e",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "28279543": {
    "fingerprint": "1584673099b6d6514ea6b54cb6622de941fa8b4be73a33b0f38953e35da50e82",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "28450915": {
    "fingerprint": "48566d9137fca73ca7c8a7bb2415103ac51157b31970e8ab8909fcd62aa8fced",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "28470714": {
    "fingerprint": "66fc62dee429889c6f3b1bd2b79416dca53b5a285088d8b3e258ed6a841cbc63",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "28546905": {
    "fingerprint": "a0666a717dc6718caaa7e050f38a0816ddc3aa0fc815d7cbef0170f91944e85c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "28593363": {
    "fingerprint": "281717d785a6623803d7abab15b1dafa7d04fefabe34158c06e9786bfb083489",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "28933734": {
    "fingerprint": "2edd4ff6ee19568e46966403e79a033203f9d0f74005bead1708d77840ec843e",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "29172562": {
    "fingerprint": "f5a14f7a4fcb191d988251de2486634a1fc44abe4eca4435697dc162cc50aca1",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "29401950": {
    "fingerprint": "4b709adbc79576f1f3bcf3119e4f67e5767709236df8653e9526ae7c63033035",
    "suites": [
      "tests/classicBanishment.test.cjs"
    ]
  },
  "29402771": {
    "fingerprint": "84d1405fffd5725adf90f3020ced0397d8a12481956821c29a82cc939a10359a",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "29491031": {
    "fingerprint": "9aa4d6eda2e30d39dfa8a04eafb85fe246cf571712527135fb898acd7a4878a8",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "29616941": {
    "fingerprint": "a4fb28b927df821623869bd729dd0bb99d8e77de18889d764bbe7b5ef1b6808b",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "29692206": {
    "fingerprint": "e219f94ddcf9e169c077e47c39fc63ed013999a300bbf309af6e8f76eff7906b",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "29802344": {
    "fingerprint": "6c8dbf53b59f64b52084bea8e95a55c8b7d63494de2aa1bd5e32815c1c1b5a79",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "29929832": {
    "fingerprint": "380c2ebf7a022c606f4fc5c395ca179fea192b2df6528242e7b503104f0848a3",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "29948642": {
    "fingerprint": "bfdbca3765eb6726012c45e0236b4f9d634da3b15206f0cf79625fd7e8f0c5ea",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "30090452": {
    "fingerprint": "7ec5ad49f74beab20b1b8120c8dde1425a998efee7c6e4b91e595ae6d7fb2248",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "30113682": {
    "fingerprint": "6d696b29e75c4b5dda623b4c1587d33abdb2b90a8ad67a7484ae1196db7f2fff",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "30325729": {
    "fingerprint": "3b71ba709687dc1873f540a51b90988fef37460102d471db83910767433946c0",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "30532390": {
    "fingerprint": "22cc3345eadc77118d1aac52727d3e54132cbd38c2fc887ab1502e4377703e57",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "30655537": {
    "fingerprint": "142825bde4e9b933d460f9b38fa0822219b32890c0909ee218662fa46f800b2c",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "30778711": {
    "fingerprint": "2b57bd998544bea374c155d3de53424c1d9574182782372c13e35faaaa1cc92a",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "31122090": {
    "fingerprint": "537b2a66f17750c2e6fb917fe02585d45c73d4277da841a96f3ada7afd79b762",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "31242786": {
    "fingerprint": "e52780b598f1aecc6cd540aa1dfb5d33f6b2b8b3204055056a0c2e6597a0047a",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "31339260": {
    "fingerprint": "0e5fb3e142474cc6d04109b50bf1001fe57b538c1b495e8867d7c2b6c49868cb",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "31447217": {
    "fingerprint": "f386f164e16ba225c2233fabb5ea081a2ef50542dbe4b998bf914815ffa908b3",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "31477025": {
    "fingerprint": "2998a355454ab4fcf1bb7fdb988da9ac5b6dbbab1b23bbd74e347eba1f0c8fea",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "31560081": {
    "fingerprint": "7d2a2563efe748044ea91e69c547496302e2fdc169106d99b23e1ced07b217c5",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "31987274": {
    "fingerprint": "1c9559657708e7bdbdbc807867282947e856d0d83f414f06e4c8627ae76e7888",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "32012841": {
    "fingerprint": "63d654bfb492aaeaff468529751981fea69fa2a038d0142a273fdafedd1cd501",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "32268901": {
    "fingerprint": "a4ab31deb3f25d91d17c6ba56d80ee8043d9bf3139694440b5a946ee53ab0d56",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "32269855": {
    "fingerprint": "7e0812de1b849318cb28d4ffd2e2a2062d5295a0d27f14e2ed7a186c6e551ec8",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "32274490": {
    "fingerprint": "2bc9ea35366cd7bd5d94dc826f9d1cfe66040a5d9d4201b4b41476a22b053039",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "32344688": {
    "fingerprint": "957059fe23f5d645998cb17f426c35a7fe3bf90c6ec853a5fe2668ea9a3691fb",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "32355828": {
    "fingerprint": "9ce8ed0fde9882a164b9015dcdf87d719b84f86470dd8b7cb66b54f171fc5458",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "32452818": {
    "fingerprint": "b6fc81808477e490ea17a058ffda3ef95ac824f14c2bc638f6688a77bf75c1a1",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "32485271": {
    "fingerprint": "e3a62221db74b9d915c2a3bcdf02f97e6329e7521ec2240162e58d7e56021d43",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "32541773": {
    "fingerprint": "29c5d784ae482f10bb033d3dff3b7c7ea173864e109ad0b69e85dace18a686c0",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "32569498": {
    "fingerprint": "2d3ab17294f5e076ab90a29c84636bf23e237c471bf7f4a61ea1b782b2961b1f",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "32751480": {
    "fingerprint": "857f90c150550ae4b2d421bff4f09b6da1e396723f308afc5ac05b5bee142a19",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "32809211": {
    "fingerprint": "7da20beb8de15da16874f3071db8f8442a69ddef5c1976d708d36eea0e6025e4",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "33064647": {
    "fingerprint": "429a4018b27df209a7ed7c017a9e9d51641a3607aa9cb0ec193f33d494d72a6f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "33178416": {
    "fingerprint": "4850657f860d169ba425419e824abe838ce1657737df28951bfe4aab377c74f7",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "33621868": {
    "fingerprint": "9316a6d6efb3a721e86219b0489c7b0060fb02eb77582d68da24be61e1ecf8ea",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "33691040": {
    "fingerprint": "b03d8084943953c833f87cb48a4fd77195df6f826f15b4d24838bd6f929bb4a8",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "33734439": {
    "fingerprint": "57a9f49d8f65fdb8d60cc0c56360dc50d265c4896ccd80b8290274bb1100f9ca",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "33878931": {
    "fingerprint": "d0b142886759d628c59eb2cdf5e9fcf8801ad0d2ef8b2707bcc87eef52f5ee79",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "34100324": {
    "fingerprint": "3e40ec3e8b0f96d38fae0d896332980833be632fb3f52a785da10011f4cf4b01",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "34290067": {
    "fingerprint": "fd6daed085fded8594e3248c4b11924bd1c0dc094042f906c12442965e6d6089",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "34320307": {
    "fingerprint": "5e8e45702c995890c1cb49ddfb62b11f84114f23b75dc9d744002b3c5398e1d1",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "34442949": {
    "fingerprint": "f8ec5726dcdcf5cba0eab54969a5cd198edd8d7ca2baa27b55599451c26988b4",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "34460851": {
    "fingerprint": "866af6462c506c939ea2173803489f24fb19ec22740c1ca8e7ada6d152d574e2",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "34536276": {
    "fingerprint": "8494a237e5626f7107172ceabe7f37e133d7b45f3e75589c67ad37d4081704f1",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "34690519": {
    "fingerprint": "df20042b0c8328057df4d6957390921b00c15043dca329909fdb538ee51435ba",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "34743446": {
    "fingerprint": "2fc6407aa368b78ef992945de861b5c15d3db77818736cc6a190a945c2c682ff",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "35282433": {
    "fingerprint": "4830a753db383df477125c555adad9c6c57ae0b6420ad65c048651dcb2878cfc",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "35322812": {
    "fingerprint": "00fceded9e692bfec83da24434cef1683ca25e403d1714e854f6f144a6679961",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "35565537": {
    "fingerprint": "7f285eba98253bfe5921df02d109ea1b1c2391860a474ada7d7a47d8092c5608",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "35712107": {
    "fingerprint": "0a860014867933fe2565ab62ef6137479958369dbae396ae8f4867f35880e81a",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "35752363": {
    "fingerprint": "98dcf16ffd82935304b3d06dc94f2f62d72a12032dcc9e78aef1540ca52bc07c",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "36121917": {
    "fingerprint": "e9e25a4b60a15e77f30c3c7ce3e5d66925d05daf05af9f70e36377ffcdd6dae7",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "36151751": {
    "fingerprint": "43feef72d3d8af86012fce9a4b532f047aff1e459dd0f8644a97189874afcb3a",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "36304921": {
    "fingerprint": "9c268854b0e59f40748117db91f95c2e294d14c70896f3141480e15f92484932",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "36607978": {
    "fingerprint": "79d6ac7281f8fa45e679dc8b67b0c775c84d8940358c44ba0bd2d121b84d104c",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "36821538": {
    "fingerprint": "475b76cbffd7a80a9cec267cc8a7e327a90d8533d888feb8b5c9178696db2064",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "36904469": {
    "fingerprint": "08d7c51489cc8e7e76f7f7aa2b58760c4d0c273affb81152977da0b4ca7b1bf3",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "37120512": {
    "fingerprint": "9f5204457437819afa1ad27f361859b7c9e28fe059ae2eb9ad33a916e7a3f496",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "37160778": {
    "fingerprint": "1d1e609c74f6d1d59c9188ff513c27d024a3238e987e4b1f9c66cb22a93829db",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "37243151": {
    "fingerprint": "179ed7d5fc92ad7a4471a3815019d240e3b772353a15cb1192ff2f227ec18a9b",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "37313348": {
    "fingerprint": "a76ca42746655f27c8a1f98001395083428a180f8c2c5d2cc5d34a2f37b51594",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "37421579": {
    "fingerprint": "e5986e4fc468748b10243e4223cb8d52ee1d312186b53d677c56fefa5436056a",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "37820550": {
    "fingerprint": "5b542d988bebe0acf93c4e09918634589abc80d81cf3fd242a8368d8d565cf40",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "38035986": {
    "fingerprint": "f46dc9ed03b1ef58bd0fa57fb48e203eddeaccf901dd1eae48a8d33e8f510636",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "38116136": {
    "fingerprint": "aa68afcdeb505998b7fd8c7b55fb54354a6035526f04efa09cfd3d4081f7bc82",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "38142739": {
    "fingerprint": "48632667b3dd738e3ba24d79e56d77a1210aa344eb6da983588ed56ef92ffca2",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "38199696": {
    "fingerprint": "f81b0db113d7469c8b13a6c1137aa9eb5651371e6d4da20288b6de23673a3ee4",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "38289717": {
    "fingerprint": "30cd9d64d47036b65dfebf48ba6e7fd2a91f0debe2b973b2803567c7e5116a11",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "38445524": {
    "fingerprint": "6ebe021eb7ccbf8741b3dcdbfc89cf123063e32373cd799dfe60ad1c7f42b12f",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "38916461": {
    "fingerprint": "973410ff2701d52560b8630a9b5b692059bffc0735896c380fb8706c621e210b",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "38942059": {
    "fingerprint": "e585150ef253910733acfa7883123e4cced0fdadf09a62a88014a27e07741ecc",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "38982356": {
    "fingerprint": "4345be17330f69357ec63f5c8aded616a2e81378438394f8a4d6627144e4a4a2",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "39004808": {
    "fingerprint": "7affb8e5f28857b54f26d5a499116c6bae96740b41bd3fc0e4797198dc1d17d4",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "39111158": {
    "fingerprint": "0f9f17da4a78b4721a6e1f8c7609b00e51fb312f97a00498d21640d873fac094",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "39175982": {
    "fingerprint": "280cc52253b29fa979388d872a2410cf914e75fb6d182d3453845b1f6a39fc29",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "39239728": {
    "fingerprint": "a7da0429ecf1979856d021d4ee52e3fe61b9718b6360e314190de907bec6636b",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "39256679": {
    "fingerprint": "3de6809588a387d3638d46c75937af33360ad1357a91682330bbea22811f98fb",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "39774685": {
    "fingerprint": "0130aadc50877652a41afd4f1116b8b8522b67860a2d40b978ef9afd30cd06b7",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "39897277": {
    "fingerprint": "afbc8c8f3d6176f41e4165099d0c420d0188bc82d6d20a3ce86e477b05adcd8d",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "40196604": {
    "fingerprint": "de337cd108c3acb1b98cd815390cee990b7d9a423c23311e2d90d08e360bacc3",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "40200834": {
    "fingerprint": "91be062f02a3459b6037908fe9394360332f5e8d6e169f24054791ce423e47fd",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "40374923": {
    "fingerprint": "6d0e0b4c7cc116f0b96403166c1d02651ab4d353eb1755a4b7024d69f1a91b3b",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "40387124": {
    "fingerprint": "74f657c37a4898129eac9dc49f86f15365d2a75bac4bf72b613b600b22850cce",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "40575313": {
    "fingerprint": "fed5bd3f12187e222456d0ab0e857d49f7f8807c430a6d2776de52e2e5ae5690",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "40640057": {
    "fingerprint": "3e177ad44f5a896afc5d6d83370fa1d46331537b8ad89f774da9bb98ffdb5a4e",
    "suites": [
      "tests/classicQuickMonsters.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "40826495": {
    "fingerprint": "fd3ea52e217013c01885a4f6664ecf86d18978069f449d80fb5006ec76b38768",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "41061625": {
    "fingerprint": "8ddc779514dd97c1aab9758bc9a91c7046585643b66f666d487cb74bbf18e7cb",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "41218256": {
    "fingerprint": "45ff6e7e4b90e7d26e6810008752c6b95a04b1333ab647a96eadd1cc94733668",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "41392891": {
    "fingerprint": "3d99d5bc41f6b7f1e3ba91497a79a780d1dabb8855d3ee86c501720f9a3fc1c4",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "41396436": {
    "fingerprint": "7fd6dfd1dccb95e383805c770a30037e9241af4f2bdcf1f5b1d26faa8ecfb570",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "41403766": {
    "fingerprint": "3f1ed5b9e2b056d1d5b8c1085c8a561ec96ceea403ff2238e68762a553bc82bb",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "41422426": {
    "fingerprint": "6330c3b6aa2e034bef400611c61c3bfb8587d9949c5138271fb3e5e3e059cb97",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "41544074": {
    "fingerprint": "652d27b1560c8930c4d62f6d8aec04324ed31d66d442249dff6f6d60a029a273",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "41762634": {
    "fingerprint": "88d7757804ef9c4a49f83e74c2099e84e30fcc429db3bb431382dd57505a515b",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "41949033": {
    "fingerprint": "d3448d7bd7234b683d48d4b465e52cf53fce91c74c453a158a43c1d15b4c9375",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "42071342": {
    "fingerprint": "8d19fdc483319053ba72547f22bca9a27e3ee2a50bb9792e2a0ab12b4fc0e755",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "42129512": {
    "fingerprint": "db8af9543a9dd89eefc9b65d5944fe08d9feef99e72fa513df3e31fbf454ac15",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "42348802": {
    "fingerprint": "57d2206c37950d409c5f4bee4b2607226a741ed47685e62f9bba354c2498f748",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "42418084": {
    "fingerprint": "60f90f3b4d4ba48aeecc993994400ddcc14d5235eb6e55fb0be35dbc32f7aba0",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "42431843": {
    "fingerprint": "b43ff78854d4dc3fb02ddc86a48f2a17fc40786ed1f2da3e7e97f95963491fac",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "42591472": {
    "fingerprint": "2b8f61710bca80b8897600d7da1afbfff3fadd858ee2f1110c7821bcd61e9e26",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "42599677": {
    "fingerprint": "8ec52569381394cbe269e08e7daf82232d872497afb1d9cecd160e127374db69",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "42625254": {
    "fingerprint": "e9245740a61b2ca408925b30ef2a503700af4a33af463fc3d1ecbbf558e968af",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "42703248": {
    "fingerprint": "01363305752e46c28815b36e6f2714efd5f490ffe2e8ceb5c539bd7418886f81",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "42941100": {
    "fingerprint": "abe900a2c772181ff0f0d78e42c5870cb523b4e53b9d0d36afeab53557cc84c6",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "43230671": {
    "fingerprint": "63875a3e0420ddcf674f4709852b04a9b23951f83f318a8bc6f858384623692e",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "43352213": {
    "fingerprint": "972ede3a267a2e858074db92c1b5eb84976dd21ce79cbfec205c0600fcbe9991",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "43500484": {
    "fingerprint": "4337f474121a75a21facbcff98447d1d87cb1e7f8b4fa706ec6da32512951fbf",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "43716289": {
    "fingerprint": "705b07479cfe8f5a301c593f750c19cc7e6a30f87cea1cf8e272831af111666f",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "43793530": {
    "fingerprint": "5d049656d718de0dbe0c133c8c749e81978124079f94ad3eb10dc4b438604c41",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "43905751": {
    "fingerprint": "f74ffcc30ccc788a5e5a2151b4ca7e8128316ffe42e970a8f579d24bd03db214",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "44073668": {
    "fingerprint": "181fe361ff7b39966db000faef60a4276c57cd00395a7b07f89e9da8a66d4896",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "44095762": {
    "fingerprint": "e5cf024c9d55949aab36f64e0a19a59152b641b4943651dce4fa63e6ba1e18fd",
    "suites": [
      "tests/classicMirrorForce.test.cjs"
    ]
  },
  "44203504": {
    "fingerprint": "7e611fcb2544a7eb570f01a5a2fe0bee802b4faffcaef1a468a14eb5b7e501a8",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "44209392": {
    "fingerprint": "9d5f942f8d6373ce9a43b80c77461c2ba29e51b44f7e328774aa70d398ec2fbe",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "44287299": {
    "fingerprint": "2b2f580950d4dde49551cde7253838ba8f9d6948f4b3c3870cfde05d3afc90dd",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "44519536": {
    "fingerprint": "9d62c76e9c5a20912f1b8775f7e286f937bc457568478e3d10c606bea0de8f4c",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "44865098": {
    "fingerprint": "35332e2b9b93e859329c31e98965fb3fcccf9a7fd3ffc62fcc2554fd0c280489",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "45042329": {
    "fingerprint": "a6f9d992bc40a0ede9b9dc65e563f9f4d1e606e73ee55a4e62a951c5cf6f1b8e",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "45121025": {
    "fingerprint": "6947bd89748e1225243767908235314454817cd2a712948a9ee97a774b41874a",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "45141844": {
    "fingerprint": "b248eb80cec8d8db6c7d60bb08cd6e84d0b06326ba5037f07086520b0a58deaf",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "45231177": {
    "fingerprint": "5b7a4fde3aeb8d2b66fb079a87c6d8fb6267bf8cb125f705b3db7bf885f01c58",
    "suites": [
      "tests/duelExpansion.test.cjs"
    ]
  },
  "45778932": {
    "fingerprint": "f3c6a43d0d1cc731233e137cab57275777fb7c9697d10b8e3051240dbb55b906",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "45909477": {
    "fingerprint": "a6b95fdee22200f0f6d807aad997764cf007b3cf9f03562bfecea957f21e8e15",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "46009906": {
    "fingerprint": "4359669b0fb126f08bf2707597abfd4fc379bbbe0ec290a792b2ea5ca973a17e",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "46130346": {
    "fingerprint": "c42feabc7ec2a81474f5fb586bf035ba0834c3788142e601e619f58ef0671fa9",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "46247516": {
    "fingerprint": "c16a9e68c6722fd37fae8b778b1bced7977177c70304757bd8644981f681f779",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "46457856": {
    "fingerprint": "2426906526d8770a2966aee32c518bb2eaf03513e318c0a7693a2d7889859238",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "46474915": {
    "fingerprint": "09c56354d4743bbe0b925fc23e5738553b2ddf9c2d85a5a84f7f59665f9d5eee",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "46534755": {
    "fingerprint": "8efcbc2fc4ea39b1797675e7b1c7974e4271ebab43d4797b2efb3c55ec10724d",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "46657337": {
    "fingerprint": "2f9f4d4012e7a344f9444c1666fb487737d8f091727ca219f0ef18c02f1250c9",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "46696593": {
    "fingerprint": "b636ad64718f6324da9184dfd2ef2001bb5f831ed7d8996be8b381a783720465",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "46718686": {
    "fingerprint": "6a2aedd0bedf72d9227dbdc64ff4cb31e2e4f0e1efe98a2a2db65ff0ce96903e",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "46821314": {
    "fingerprint": "acb5581b4bd85eb8859517ca9c34a0494cedc057598c1109799b267fcb9c1304",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "46864967": {
    "fingerprint": "2d076c31bac4aa0f8326b439ac24127074b59998a0c7eb959d5b732f7d8aca26",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "46918794": {
    "fingerprint": "091ea5bb8048f0347ad6e6a0f136812916fcbe9f992be6c08eedb2f2033e160d",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "46986414": {
    "fingerprint": "a05b7305b72031f37457c7f8b52a8d0034edce466c4d8850e536ecaeaeea4172",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "47060154": {
    "fingerprint": "a6f1500309c291ebd6151809938f79bf439b671527595f37b07ef8e09843dd45",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "47319141": {
    "fingerprint": "857e519ec6050376a26471891e190ceb314211e3ec17fe2a106e82e7998ea6ed",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "47372349": {
    "fingerprint": "fe32621f1af89ba4314f7612db2d81a18a800feda5a24862d2ca13099e76c7b7",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "47695416": {
    "fingerprint": "80ade0467259c128bafe26adc4dd46fef91922419a158aee7e46d13192124966",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "47852924": {
    "fingerprint": "fc4c876e374637f9ad2607213974c8bad1f9c682bff343b3c20bdaf88ee16215",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "47879985": {
    "fingerprint": "c2cae02b36378c21ae91fec466fba91f66deb17c530db91d043b9f6e5c668690",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "47922711": {
    "fingerprint": "1d5433d312aa52cb443cbd67dddc354bb84f697c19f94852105e550d4a9bc9de",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "47986555": {
    "fingerprint": "ecdeea6950e1d1ee9dc6f0b2fcec940ad5f5a72011f6f55cf84b530eb6c72296",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "48094997": {
    "fingerprint": "77f50a95d09ff1ee48d51cf3a98c469dc6ab3e81e5d0bf87e49acd090ff3274b",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "48109103": {
    "fingerprint": "73ec899e644c3a20830f9bddc4a8e55edac087b98ebcea58d877eb963a1b2321",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "48202661": {
    "fingerprint": "b2fd097796ccd9b4ded60b2d635c313498c79ddfe14efd21a6586bd210eef7c9",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "48305365": {
    "fingerprint": "f9563dbc0dcec699e1c9828ded68ad8b551698b82ba1d9e10931782846c41d13",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "48365709": {
    "fingerprint": "3c1846cbf731d049a239a7bcfab8ea0d7c58e880c4d003a94204dcfa301896fa",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "48531733": {
    "fingerprint": "90c198d53ec42baffc6fdcea1c09aef5ecd5ea8e363d932e7e03600d775c01f0",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "48649353": {
    "fingerprint": "2bf5388f0e653584d85e49478244b69d0aa62cc0c6fe4bb41134e002061ae130",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "48766543": {
    "fingerprint": "070c4c889b6abd6a8daa957bddfc1ad6bae426bc581f1eee25afcaf33238fce0",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "49003308": {
    "fingerprint": "95070c030efee54e46220864a2c01d69092f86de53e53a74a7b512045d7b2cee",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "49127943": {
    "fingerprint": "b55d8dfedb0d7b8b9378362cc6fab51a0e92d5f232deda1a635ca6ee8a89672e",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "49218300": {
    "fingerprint": "94feed92386bd6f819395741e57c8fde61b720381039828dc36ccbdcac3f0c0f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "49258578": {
    "fingerprint": "2bb33a43e604da1bac6bd8eaaf492501d961a4b0dfabbd7ff17ac2e861e8e323",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "49370026": {
    "fingerprint": "6f8ace6021b513f6a7e53326a609828fac476844710ce8daf81f1eb32f894695",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "49417509": {
    "fingerprint": "566f3956bb03c1c33e1950ee866ebd17053b157abcf0d9e4f97f05d6e1bce7d2",
    "suites": [
      "tests/historicalNormalExpansion9b.test.cjs"
    ]
  },
  "49563947": {
    "fingerprint": "350a41037ee29970bf4b333a97197ee286b489395fd85718363cd056e4c00855",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "49587396": {
    "fingerprint": "69b2908023621f43fed16993cc192fa0ae42d36d847c6447641b9bc7da814774",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "49791927": {
    "fingerprint": "9f4b152c987f3a5b003c7a73340a5b780bd339fba92eae9e09e2e7c16f99a6ed",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "49881766": {
    "fingerprint": "f14dc1e3059778b79f05fb780ad1756c50f9187fe0280d13102827b7b8a18b1d",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "49888191": {
    "fingerprint": "c1ea725b012caccb2a687209b606535dc24d70df98931e9f3352da579f3c0b6d",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "50005633": {
    "fingerprint": "ba22bb91f586579945838816617eaa0a9fc7b4f16fa4a23a25bd3d4a86608715",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "50176820": {
    "fingerprint": "1b2f8ea958d6a1026425d6ea0432bb433079f3ccf130fd0821a77719aaad702a",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "50913601": {
    "fingerprint": "5a3ee510125d4edb290ff6354591d1c47f7be74a7ab269e4a1ddf110501e8ebe",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "50930991": {
    "fingerprint": "86cfa3ae0fd3ebbd22495c150d4ae380018d8b65c7ded54657533051d139ecab",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "51228280": {
    "fingerprint": "f4b2a2cc69b3f00f24262387b9e003e0d6047bb72a45bbcead7923289fc55240",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "51267887": {
    "fingerprint": "536fd0074a1790d742b9170de11f385cf37d5bc16900ddc85a14986941c449e7",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "51371017": {
    "fingerprint": "b4e635b1d69d9d17e8c6805c69dba6ebcc7da042ec78ab79152bdd0975dce422",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "51482758": {
    "fingerprint": "3068f5b3f22534e93617185161bf4911de9586b18d53b0080fe7f1e726b9aa30",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "51828629": {
    "fingerprint": "a4220f2adad4677050aa0582efa4c0dc6c2a431799d95e1b07c2769b74c49fb4",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "51934376": {
    "fingerprint": "9f8f494f890a13dfe2105738139c779b92de6446627b82b82c84ab11b2f9f426",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "52097679": {
    "fingerprint": "e9362b2005ba552ae33eb593b29ce847026824c0285b7af958fc741f2ddb522e",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "52121290": {
    "fingerprint": "6b0443debf1e73fdeabd70e9089791a1d01aa694f45eb9b8d4cefe16a2b519ea",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "52367652": {
    "fingerprint": "e3cc3e1e3104cf7ce384dd351ae00c31483643b87212979f22bc86a4d86052fc",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "52550973": {
    "fingerprint": "4655d9daf06cf4f545265ddbfa07679cf93cdf5d38e2f9698c7ab41d207c9d86",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "52584282": {
    "fingerprint": "b44b617719565c1c3433c843238c53a78a4d5e283ec24133660753117615650d",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "52800428": {
    "fingerprint": "9db9f806ace825bf52e7d39e3bc955fa8648597e69007b38f8e28fa5e97ce5f1",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "53129443": {
    "fingerprint": "db39c8e41763deb9b508ee85d67c3bad80cf377ba47fe5583988d07833d923cd",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "53153481": {
    "fingerprint": "2cd394711f5a0777a320f14094387d2792030cc8dd45dc3977bcb2fff094d079",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "53293545": {
    "fingerprint": "2fdeb4682d02d1584d004ee9bb3fefe596aefa21fe1957c259ebb4b8523aadd7",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "53375573": {
    "fingerprint": "00394bba9fc22cda0414b492e7433fd0bb31a9bbe2265bb70db78e9636bf654d",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "53539634": {
    "fingerprint": "ad904c5747489eee9a0f60d968e984a39a5a9960885b12f4f8d3c5c581aa7cc9",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "53581214": {
    "fingerprint": "95327df70a9acaaecfeea6879bd15d6d8dc5b89d259ea1b56527d4918d877702",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "53582587": {
    "fingerprint": "bda9d1246a78eeca066cafd0a90be4522a1189cb7f2a3e6495606a2baf4e5f9d",
    "suites": [
      "tests/classicSummonResponses.test.cjs"
    ]
  },
  "53606874": {
    "fingerprint": "b30a7534a2aecac524ac679d54232f8bbd928b4ee6da21549b9d3677b65f2fa1",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "53713014": {
    "fingerprint": "e201d270a901187ffb2ea1bdd11cbb5a67486dfa047c93fe8623611f382917c7",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "53776525": {
    "fingerprint": "86588ec46af67615b42e3c9097f32ba95ff2497167b5c3f637cf0bc803dd1305",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "53829412": {
    "fingerprint": "a8bf4a56ef25f0472a90d33d15812d36915c25252a3dd22d1c6761214ff60a46",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "53830602": {
    "fingerprint": "d2f9d649fed35d72eb8527c8b3e8077fc7540436ac986dbf93db380c67a13afd",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "53832650": {
    "fingerprint": "4acfa8add27e3730493a3e396c9bf9230e64373a944da9c19fb0dfbd82e65d69",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "54098121": {
    "fingerprint": "87822f28fcf690c38603ae676f7addd44378de5daf71aed03d75c3278fecbc2d",
    "suites": [
      "tests/classicSummonTriggers.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "54541900": {
    "fingerprint": "2a0c78c2f85f7592f0ae5e108f8b7dd2f9fc97a099f134d382e7b54edcdc4960",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "54579801": {
    "fingerprint": "cb65d544fa1c0dff2245a20896a11dded5f0b9e8dbe56733abef84d4d76a93a6",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "54615781": {
    "fingerprint": "660197f88eeaab487490f7fdb1c8998826d4095de46677f134d47051cbe55b09",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "54622031": {
    "fingerprint": "cb7d5c41d37090064442ba57c49c737d003cb4d27a11c2bb7da61b1a902bd00a",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "54652250": {
    "fingerprint": "1fe072a297cd7f3c9e72832cff565cefe3e95e990974e558aad2ed7f27ffc009",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "54844990": {
    "fingerprint": "259afa3a566ca31a052c6798ec89aa34f200a3993409ab8d63637e192a71eafd",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55014050": {
    "fingerprint": "7ef7726550b2e7703ec1e892b3cf0848e82fe136a755596a8c3f0d39f80a035c",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55144522": {
    "fingerprint": "3f5cace2491286d6563f0c73cc79fc2df2eaf9b6d2d52cc8e54efef7eb9b31fe",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs"
    ]
  },
  "55210709": {
    "fingerprint": "a707afe8bdfffef96f92680618cf7efd1d598f5e8eb797aff237303fa843fa86",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55291359": {
    "fingerprint": "e5ce4f6ad71ee1860eff70bfcb0f5e8d7176e1b6326d031a475f46bfc0ca29aa",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55321970": {
    "fingerprint": "936a439ad65bbad1a1b07d283d0fad2e23c7c237aabba079614fec85bc2ca67a",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "55337339": {
    "fingerprint": "8077066208144418197cd4c37427daf66a3b028b2240b90da5dc1ed69cca6317",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55444629": {
    "fingerprint": "0b4b4fbe1b8d13d98e293433b843aa541939817325d0f9bbdd332367ddd6e99a",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "55550921": {
    "fingerprint": "bba2593d06d4c1a6c6f3a3e432fcf599773a378dcaf3c6aafb515a8fbc4de122",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "55567161": {
    "fingerprint": "62a3a818bffd7709e0c58dcba75363efa2f58e5c2a0862575d375eaa5d5af200",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55691901": {
    "fingerprint": "0f9c469fcefb4f4f9fb5a477fe30bcc5f3b6441916ba733ca0fe879bb46bcf41",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55784832": {
    "fingerprint": "b5126253e585f887001c678e10bb1de00f2f8fad758819e5aae0aaa96965dcfc",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "55998462": {
    "fingerprint": "18a2408c5851764c9e9af5d726fbd308fb80d91f3787adbc3294ba205e390b09",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "56120475": {
    "fingerprint": "b3750f8f181e2e79e21ee3187abbfb4df606495883ef30066e6051429836bf54",
    "suites": [
      "tests/classicSakuretsu.test.cjs"
    ]
  },
  "56260110": {
    "fingerprint": "f5214ed8b572fe7657232ba1e5c12a48d16543e57b918ef2e047132a72b855f2",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "56283725": {
    "fingerprint": "b4b2cb7dfb709e01df7cb8010f40122312a013128b52917241d8485eb65b2abf",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "56342351": {
    "fingerprint": "0b4da31f47361cb2aa7d2f56c3b0a4cb0a853167fa56f2965f46e691607dcf1a",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "56369281": {
    "fingerprint": "ef69188244e295029a15d2030bf2cef6bc5c9bee951a3cf62c595a43823c8848",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "56413937": {
    "fingerprint": "3662f4eacbd08898194370bee8f74a2722858a3c8d2cf5de4f26ba5511a8a86d",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "56594520": {
    "fingerprint": "32f438697ea66842e3e9bdea4eafdf6d4d1b57b7f066e1993fa8629d0125cbb4",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "56713552": {
    "fingerprint": "524ae8d91074f9ff484e0b0b7df9b3b2a823640db11bcce755afbba8ab5bf340",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "56747793": {
    "fingerprint": "2647b701432276d064f0cd79dd1e7f02afcdb05cec42c44d13647fef67c260d0",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "56789759": {
    "fingerprint": "d2ad9d5211f3dd426688901aba6fa8f93ef3d3d8528b7661754a57979fa82c32",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "56907389": {
    "fingerprint": "b8d6c4da8c6c558a0825d32ecfa26e15c4ce572422bd605ed42d0244e040b1be",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "57305373": {
    "fingerprint": "50be0be808994d050dc6c18e7eec4315e0e3dd1bfc126c55c57193c6c0cb61b7",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "57405307": {
    "fingerprint": "dc83c1960e2775efb4f081fd55d5a7b51bea005154b427786ae3d3fa033cbc70",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "57839750": {
    "fingerprint": "f750e6a2f9710fcbda1d99a6c500952afc85e2cb39992ee4b0c89f20615d2347",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "57935140": {
    "fingerprint": "8d4ed63be04d609e43af94371a44d208262c407d17754b781aa7d8e22acb8dfe",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "58192742": {
    "fingerprint": "350cade199e519bda0c180faa43028611108f84acf3a853471837827048d6bc6",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "58314394": {
    "fingerprint": "d7cd85ac8a12d1db78bde065f3034d7273950a716b3400ad47bd3fff5cc1055b",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "58528964": {
    "fingerprint": "cdcb9a5d66a49d884601bc9ca08f348916785e10a5d68f02e92b410baffd2640",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "58538870": {
    "fingerprint": "6a5dd353f32062d1b3cc772514ea14fba53a2ab76add69d3c061c55cee48703f",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "58696829": {
    "fingerprint": "e3db24e1954d437efe28f9282cb19230302864b9b96b4114535bdb8454c7cefe",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "58818411": {
    "fingerprint": "f6e25d41ab30a0fab80c364f26b225f27f9d4727c73f8bfdd36e00b6bb577c23",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "58831685": {
    "fingerprint": "a684e97fb21ad385bf64b2e90eca38d3290498887dcfce4822504f29efb22ed9",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "58861941": {
    "fingerprint": "3fe5e42d92e9b4a81e152cb599c897daf2806f7c0e3dc06ff90bfee9aa12c490",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "59036972": {
    "fingerprint": "08d33a3c171bc5cd2e5c6dadc89d1ac2b132b56f31f67de2dbf81a959796cae9",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "59197169": {
    "fingerprint": "56b985586b91ee677008660672887404d42a7595292d6644678bf0e8196d7885",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "59290628": {
    "fingerprint": "0b7110f3d449eb1013d1c9e57b0b0573a44d9d8d24bb79a993cec826b8759787",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "59383041": {
    "fingerprint": "018309368df529eeb919ff8cd003f3a4c8043d971dcef48b922987fa88003408",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "60589682": {
    "fingerprint": "74397f35db3b70bdb43fc653cbbab0a2697355423953aa623329fe30c26a44a3",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "60694662": {
    "fingerprint": "ff32528e464b89d0187a11f5e289ee656d3812eda7a764b2d9309642e35e52b6",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "60715406": {
    "fingerprint": "2bc9d7969d38eab3f5dcaf0c983476d311a655766b3d51b3835c690955728b13",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "60802233": {
    "fingerprint": "83de49e70594502ea2edc3d7d4c65a0e234bdfaedd13c0c4cde7c32eef0257b8",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "60806437": {
    "fingerprint": "904fc92dd093ca751f2f3f619dc7152cc4f14b5ee7c5998ffd868a154edf8835",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "60862676": {
    "fingerprint": "3f6814479a1cb576071a2599d75422192bc43f808475831aae8169a1a17b69f1",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "61201220": {
    "fingerprint": "fc80a9ae5ab30ed502996a6dd0242d37f8fe7da58d231312bddaafcc786e4517",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "61454890": {
    "fingerprint": "cb6dacc3fbfcf8528a23be172e136b71a08c915b2ae8f395dbc2ff234ed48ad1",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "61854111": {
    "fingerprint": "c1cda237225da99c3fe4fccf8dfbf436a0c4ea2be035b6128e8a1f165d812a8f",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "62193699": {
    "fingerprint": "5c6fe199b47aacb1a6f6dec3b6a5c55cc7d518ae8b4cb48b77bbde5d6dc860c1",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62210247": {
    "fingerprint": "e119e5d8090de324f937351346b978e6182c2a54874fb3922b34cc33c6daec92",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62279055": {
    "fingerprint": "7e56b2034337cce06e946f042446f33e3b99ce84c1b3297ba5a3cf84bd6da055",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "62327910": {
    "fingerprint": "d67c16ce2f09e19462720f60cc2a3ae2bdeef9d43ea195c0e31c4a6de6769a37",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62397231": {
    "fingerprint": "36a1c88c43a5458aac8e7fccca8d6474107b7639ea3d973cb0319f82bd452bbd",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62403074": {
    "fingerprint": "b9d3ff4414153c624bac1f4b085c6943c6bb810c069cda262643f36566906d24",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62651957": {
    "fingerprint": "f15739caf5bcd80102294b491dfdb1d762924669ebd8f7457b287eb551c6104c",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62671448": {
    "fingerprint": "cde2f5b77195696e097d9e89f957efbceba50afa3a9de7853cb8edb03f9d939f",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62762898": {
    "fingerprint": "0ecb892b4ef9ea05ccd1819e1d74c669938f5e2cf852d49f1cdeb44868d9b4e0",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "62793020": {
    "fingerprint": "c3abb66ad76bbf1874abbf5044b41f4ff7c608922fc106408dcef9eb36ff4c7e",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "63125616": {
    "fingerprint": "acb0a5382fae830ebb89ab989f6bb19bad85a608517477b2164839f370ff88fe",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "63308047": {
    "fingerprint": "72014f58d182178561f2e21d4d34eda88f0ca16c03927ae9d9d106e7d50e0e55",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "63432835": {
    "fingerprint": "2bd40055751c66bdc1ec8134578ef5bda536123b32cb384f11c39a417520af30",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "63515678": {
    "fingerprint": "92e1bae62bdcd47ee1e9ad1d358c3de76da8c295313866303af508e5042b5044",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "63545455": {
    "fingerprint": "6cbb05cba026978462223a3fdc126a4817e2b6d6f8f971a97e8444ee3741b766",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "64154377": {
    "fingerprint": "6d64050e3f8019b582b6e2fddf5b2f24b4de54c4c096f9cc29b8da0ef0f24b0e",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "64271667": {
    "fingerprint": "8903e400ec1e1a0688c4e0f670bb5a8a660cb824f4f64af25df25a86f8fce01d",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "64428736": {
    "fingerprint": "c1f316d6ae94d1c2965f311ace3bd747df55eda55ca58737fff78330709e6fe2",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "64501875": {
    "fingerprint": "3a314d976b6ee6bf71156eb0f8db880e7e3886680716c4e23c8d4b951daa1894",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "64511793": {
    "fingerprint": "8890ddce65b47995b2a8949d1c2394696f79b6489b4ad3226fdd285e4a6e3179",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "65570596": {
    "fingerprint": "26a7699c2ec2b9e1408962e17595b8e103c34b64aad0fda694f6f6f852134004",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "65623423": {
    "fingerprint": "21e66141b011e1f9f796a69468caab2ad017f9d2794df55921cca012e0ca6ca9",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "66516792": {
    "fingerprint": "e520e5e1ccd54a96274a4d00ff0fbe1cbe3a1793c2915d849f2e48b47015c6c2",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "66602787": {
    "fingerprint": "fac4f33a83623642e01ca90d7ff685a57439a9d29015ff194f39bf44d05736f5",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "66672569": {
    "fingerprint": "30721d13907bb9ba3c429a7507f360ece81a2055eaed36f8dd42de34e07f8e4d",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "66719324": {
    "fingerprint": "ed1b6c3efec7dce9f7f538e4095fd5efebe68cceec3752a9a18050bbaf453520",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "66788016": {
    "fingerprint": "1f54ab7899bf901a02f4bb6466681787a9836921ac3d263a8addb7d2e49619b3",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs"
    ]
  },
  "66836598": {
    "fingerprint": "55a7decc5714a102e85e143df449228bcdd58fa752e437c4aadeda3aa4c67e6b",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "66889139": {
    "fingerprint": "3aa8c37db635f465b8ae80da250208d6d19cc540cd01f8497177453aa425b177",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "66927994": {
    "fingerprint": "1e132b17c4b0c1fb5c5458acf3f2e760a0f052ca6da176d294b87e1da0d4e723",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "66989694": {
    "fingerprint": "bb717e1b8cea7284c6f1e86867ba00a5831d807fea1986d3a7903dd0f3da9171",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "67049542": {
    "fingerprint": "1772af833d0eb3a55c7a2bb89863ace353daadb24e0468edaf9c33d6345775fe",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "67105242": {
    "fingerprint": "fd67026399ee91084884baaceccaa13662f8b63fcc1f1313c3c71a85acbc19d0",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "67284908": {
    "fingerprint": "33bd50f8abb08d8926c8bc5a65b33ba8b0b71f79b59f4365e3c71d94bc3f4b48",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "67371383": {
    "fingerprint": "a978ccfecdccfb75fb30c85fcfe01b428e4b33135f3c112aab64ba0976011147",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "67494157": {
    "fingerprint": "9038d4d8351fb4abcebf037eb2d62131bacb4f4c14317234e3f35d4ade56f675",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "67532912": {
    "fingerprint": "5ee5b549c3853e0621adf6275da7971e62bfdb10cade11d13b77d165599a6ded",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "67629977": {
    "fingerprint": "407bfdba47b6675e509aac63c9365f00e376ac34baf348f4de91e5074361897d",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "67724379": {
    "fingerprint": "c62b1c8958b5617472350959670045e72aebaa887450eb0e5d33a52feddc62de",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "67841515": {
    "fingerprint": "65e43ed1bd97131755373e8978384f3a16bd2ca83c2b35c589fa8dbd92d6e60c",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68049471": {
    "fingerprint": "db285d4208ca2e714f42e26a9571c2224f1f96ee776199f364d97a37f6a1aec0",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68171737": {
    "fingerprint": "61f483ca4f21fa1cf9365aace2825da154f20abce189b7767dab0a4e210e39e6",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68339286": {
    "fingerprint": "7fbfd88cf861e4621098640eb9874927ac4af289a5b400c2b1fe0941089b366f",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68401546": {
    "fingerprint": "b1d2528184e934d54d0d4b96c41fbc6d801b5c1c302aad996a76dad4dd11bedf",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68516705": {
    "fingerprint": "4e8cfabacf5c2bc35eebe4c74e2e0b1892a7df73bf762f90f9627e307ebf6916",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "68658728": {
    "fingerprint": "b9750c186332f6b46136a145a1a8c9e3747f519135115d65a789028cd3976276",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "68846917": {
    "fingerprint": "a5da35d5f19c2e894b250f36d68209b781473ca1b714a264b4fc1bbfe8b8ff66",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68870276": {
    "fingerprint": "beccd9cff65250047b8a6a03289117741934a1b8be69cfc791d23b6de7a7c02b",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68928540": {
    "fingerprint": "78ab0c7f981ac98f151280a7c66165ae1c0d15674bc4dffbc0bd790fbb661208",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "68963107": {
    "fingerprint": "b125a3c68130df16bc1695e780b720ced38d749cec8e50981d797fff957f382c",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69140098": {
    "fingerprint": "d9abaf5916c8062b2350ada5732753f8879dbe4ff2d4221e24c80a3568ae6881",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69455834": {
    "fingerprint": "0fffe067f5162c141dc1dbb882093476fe88e00781ba0c5c7424769c6a9550c3",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69572024": {
    "fingerprint": "c4424c24de5df2dadbf32678a43c817272cca3e613763a2667aa63ec57be21ca",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69579761": {
    "fingerprint": "ef5dc4a8798f3194b78a31eccf6eadb87923a5cbb9d91d774bf72e429c457df3",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "69669405": {
    "fingerprint": "567d065b0a05350a8ae5cac7c3bed761c2b25a50da5f2e72298825e59cd23e77",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69750536": {
    "fingerprint": "265a75fb1987c6938e95351a3937546d6e07c2f3f11896a041424591de9960c2",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69780745": {
    "fingerprint": "14d22aae29f90c50a0daa797e584e5c56825417089c96e4909df6d5b280cd28e",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69893315": {
    "fingerprint": "65095ae2ed3da02fc31a09a85655862e3d0a5b4147106dd727d9a1f4c02fbfcb",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "69992868": {
    "fingerprint": "f804c341d51764d7f14cd020ab97869b2ef1d9d58a007b1d5b0482a5cc7412f9",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "70046172": {
    "fingerprint": "8b9ee43b24a9c5d72f077bb14fb2a90336006c73e9a4676ee43a867dcc3f330f",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "70084224": {
    "fingerprint": "b2a90e836d63e8bc7fe543fee5e15266e4edfab0feb17d728f3d8b5997833e45",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "70345785": {
    "fingerprint": "9e4eb71195d8dfa6bc9a23c2ca355824ded854dc8a5f2d33536de44e5a49dc6e",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "70368879": {
    "fingerprint": "9cb54bb0bec474c34f79c8ca9226a0e6319f96e9a1e25f4683c28616b3633677",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "70681994": {
    "fingerprint": "2e7b00a6bac27c830ef3ea2a6dcf74f5279c9ce065982890bd6a41b92d117f3e",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "70781052": {
    "fingerprint": "b74f5f4faa924a2ec060df335fd5f78225c61452bb45149be32d7e4cf294de09",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "70903634": {
    "fingerprint": "733c5d3d85e7400ac4c6f4c1e5c62e01df1cf684f16893408ac2b3c31114b300",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "70924884": {
    "fingerprint": "9620dd6a738983d0424049f555f660dcc7ef361faabd5d39e91aaf9445f955ed",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "71068263": {
    "fingerprint": "78b6cd19153e079d35d6afc8f420135b7df5e39be0a4f689b5d9bdf2e5367dae",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "71280811": {
    "fingerprint": "ce8a64a19a5680235ebfe4ccf2f93d3f5be79af5fa12d89b2c6117df38d5c915",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "71407486": {
    "fingerprint": "7908eac5c63dc42830421c5b2b982436bb5c4f8c2f1cb5fe897f3e3e6e4c0bae",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "71746462": {
    "fingerprint": "b3dca803182ec7c8c9c58d23db4a44f6b40c9f03b48f29c8d385bc6c255e440f",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "71950093": {
    "fingerprint": "214a59a2089bf370554d57a45620523ea982b19e27015b534a574860312cf3b1",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "72076281": {
    "fingerprint": "1f04985095105708799481b74e6623169a17e9ae351972b74ef03ffae0bdb8ba",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "72269672": {
    "fingerprint": "ec1a184f8ce2870c5fa378b560425a0bdaadfaf1ee849ec8ae32314286fa21b9",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "72299832": {
    "fingerprint": "70bdbc1915c3775233b8e1fb8964f2ea2fb0ad5e5a01db834ebfc4be80e1505d",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "72842870": {
    "fingerprint": "4b6538bc7233d35d39f9edaedfee2eedbed0d411e04846f1d90fc4be5828c7b1",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "72869010": {
    "fingerprint": "f73a1e79059c6469eb7cc8d9bd0f16e2546bdeebb7a32ece9890e1d32d57d720",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "72892473": {
    "fingerprint": "34cffc49c6367b1000b809826852cf54d20de10bbbcde1268c6088149c0cd896",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "72929454": {
    "fingerprint": "6d1e3c890c7760d706af5404f5adbb8281ee1b507f034330471bd6ab24768cf5",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "73051941": {
    "fingerprint": "5d9436546da5076dd1415377a6b3a95886b134dd1ed74456a27ffabbb651cb83",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "73081602": {
    "fingerprint": "1e474e229f6ccef761a5e891bf3ad699077417bf76f981e1c9df242570f39656",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "73134081": {
    "fingerprint": "1e67f07c3190fb1506f06e2bc5ecf145447c5279d2cd8c03e7e21044f5ef0b32",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "73216412": {
    "fingerprint": "ce9f18e21f0d57556405e8d975a5249a20557020ce518c4f3452d3587b128865",
    "suites": [
      "tests/historicalNormalExpansion9c.test.cjs"
    ]
  },
  "73481154": {
    "fingerprint": "75e15451fafb7ab489972563b1b1ddbe635a1804925bbec1640d9491bf842c20",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "73911410": {
    "fingerprint": "76c5fa2df40e596328a8475c3b7f305e587a57fbf02d52eb4948b81187bf1c8d",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "74277583": {
    "fingerprint": "2e1defe41ef503d1a90b47c91a0a1f349f6a1b269f0ca3f6d1e6c957e817c484",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "74637266": {
    "fingerprint": "a8774307d74c9a2b24a98783313986e2419c2147668900abe6b6680b1fa5a99b",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "74677422": {
    "fingerprint": "11f420a21069f9a69e66c73dc11ee77a31e3e1dfa2c5398c24d64ea98160f2f5",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "74703140": {
    "fingerprint": "beaba7c6d696d13dedc39e5fe1abd0e0082e13d88e81db94019cbfc27a1394cc",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "75356564": {
    "fingerprint": "8888ca482fab66e2a8c87cccf880b719b362359b17854f57d789e1926d973caa",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "75376965": {
    "fingerprint": "59f86b68a9a9c9d5d828bda657bc36942af10ada7798b5855b716c8323daa7db",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "75390004": {
    "fingerprint": "4fc17911b1e09de653dcb0e68641a2765e3e47b3e7364e13312ca132a24139fb",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "75499502": {
    "fingerprint": "3f7f204873a3ef26849df8fd87d0628f7028eb95093ed2c31fdf006e5d055a8d",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "75559356": {
    "fingerprint": "f9b57175f6d07f73213c76ad0f141252a3a423f8579870dce231055991a962c0",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "75582395": {
    "fingerprint": "0235debc9b70b9a6a388cd3a0d7b2c2fbb268a74b88d796217cc3072bacb1af0",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "75646173": {
    "fingerprint": "9bf5b414e0272a17e8e294f25246bff591c05ebc6f3d99ef6f82bab441d59c2a",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "75850803": {
    "fingerprint": "36b47f2a8f611d6200ee886da61f78a60adcb50269626391927b8b30700e38c3",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "75889523": {
    "fingerprint": "fd3dee7c758f44468eccc8d337725fca2eec30a4401f739a0e3cbec7e9d2d61e",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "75953262": {
    "fingerprint": "312d9661c1f86289eb04a1ca3165bbf78619c81b486b3b94657c627fbc4c4821",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "76103675": {
    "fingerprint": "512bd04ea7b46cc062c37fdcd37b4f0cd624739c4813bac9683e1bb415b33680",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "76184692": {
    "fingerprint": "ab45fbfda67ddcf24256635a12bb4274f6682a117098b85bf08672a11a69f16e",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "76211194": {
    "fingerprint": "4fa092127a7df2f8b2fbdaf1ee21e878339078f5ab6c17e5ca975c886e3a9f76",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "76232340": {
    "fingerprint": "5fccdc2a98517712883330937d83eeb4359d790adf20a0b456052db3ee0b89b9",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "76446915": {
    "fingerprint": "13cc45b6fd59c8bbcea88a3d386442bca487312e15ea6e76c5e9532c177ebdfc",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "76512652": {
    "fingerprint": "cd58ce4be88130f5b5462fb8ae782bdbfc19ca6be1043aa9a779f47c7697d2f9",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "76634149": {
    "fingerprint": "c8adda97ca646cdb87637f47ceba8e11eab50190c64db96e6f8c153313db4f8a",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "76704943": {
    "fingerprint": "ebf6a8e0ba3bb3edc1e868ba93ace766a4117f1cfa4dd3a2d18901638b847d41",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "76812113": {
    "fingerprint": "1bcd7d3c816023c588ef231dcddae5eca756091d901de4df6d989c328c3827e0",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "77007920": {
    "fingerprint": "0e498ed283f35cc0513f1e11ea9e4a2d2157179354925387e59a610a7d948b28",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "77027445": {
    "fingerprint": "67ceb886aa8f2d74aca99d3dd066a2d98aa8284a916ba35d95a7a9d830d404fb",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "77414722": {
    "fingerprint": "b40eb3632607415d35fc6f63a9d22483867d94fdb17c09186fcf3d8601a83d9b",
    "suites": [
      "tests/classicCounterTraps.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "77456781": {
    "fingerprint": "821702463fa67c593f39e7ca953aafc1323f1d2ca2020dcf071fb2c94d26e9ce",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "77491079": {
    "fingerprint": "59796871f1e2c41af853b34636bcada9663ab3881744fc30a5e7532372321bc5",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "77568553": {
    "fingerprint": "2c8200768d4ac0be992430e36d5664b04eda0bd3db3b0e3e329f53010a31801f",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "77581312": {
    "fingerprint": "7cc09947ee1063481408dea9de123ed0f9936d0128cdb9bea285612d4bf5e757",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "77585513": {
    "fingerprint": "76f789c4050505220a983dddd38a8c7ff9ad72e2734491530b10216b4c2e8b2b",
    "suites": [
      "tests/classicContinuousEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "77603950": {
    "fingerprint": "7c6d687881af9098ea4a3043a749011a82868361b3e179200d3aadc53de9c4ea",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "77827521": {
    "fingerprint": "488eb2059bf21ddc533a6e9b2b61c29cb1250ec706e6c588aab886dd6e19a077",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "77998771": {
    "fingerprint": "1aedd432b2d7db7bfa2a0ebdbb142846cde8589f5a9b2bd831dc4055ca66b772",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "78010363": {
    "fingerprint": "d4ad8a4c8693bddadcc79fc182f6ba9fcce94290a8b3cddf48555d733e43be19",
    "suites": [
      "tests/classicGraveTriggers.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "78060096": {
    "fingerprint": "649d3b976f31e2d75de64a2cb301271cd92f91ad5a48c4de35579b3dda11aba6",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "78402798": {
    "fingerprint": "38cd37798c8e2e11503b6e08dbd738f31bdc7705b0a3eeb8f5da605fb13e6e5d",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "78423643": {
    "fingerprint": "89d2272e7813c5e5eef39158fc18ac431d86e01d9c3cc3cd7b477b20e937a41c",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "78556320": {
    "fingerprint": "58dacdbf005cb28040f42b617e750e36de525b337c830a4fb359fc2561290d23",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "78780140": {
    "fingerprint": "c9a1d361ff135dbe297d3d9b931282a9c74e723250ce15552165840fdf2115f1",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "78861134": {
    "fingerprint": "e91f10d8c504f734a9fc0393b9824355185b032b0513b7dcbc3a0fd83b220bd5",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "78984772": {
    "fingerprint": "9a4aa0292decbbe9440ed0b7e0ba150819b6d08a87c1f6bc85957f8296f2dbdb",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "79182538": {
    "fingerprint": "a22bc1576b6838a3bc195c96c791beddb830bf035f2ff86a45f455e78463ad02",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "79335209": {
    "fingerprint": "77511d1614718a49aff35dcf993495043fd8b71d0468e42d7b03fa7a3e4edbac",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "79629370": {
    "fingerprint": "7143e79439e3b405532417d7c7bdc88da7b42ecb343b35c6c4d7f4cc5f2ea533",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "80141480": {
    "fingerprint": "7dfb97c4291c5f333f8a206b0fc1e5f5182279540159a1c47791dad6cf80ad3a",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "80234301": {
    "fingerprint": "5904ea1f07b8d7accd8b62f5f775cc102252ca0168066931c9621efd16900e8a",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "80516007": {
    "fingerprint": "d6bc89249e9dfea2f5bc644809c2918f4dbfaeeed5af690b9ff0f72d076eb76f",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "80600490": {
    "fingerprint": "175a9999fb3b2344669d77b092387a98b0950374c9d4413995577bf2aaf3b00d",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "80727036": {
    "fingerprint": "11bfba97e3253181f1bc529561933442233622e71a2a22f7545d823a78b7b276",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "80741828": {
    "fingerprint": "b8f7f0ac8669d40eaaaee7ff1d99a1d99e21277c7de1f252fad1ea4699993436",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "80770678": {
    "fingerprint": "25248c6e5032055407206c281eb632b8d55851aec40d28b60df1931783c64dd3",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "80813021": {
    "fingerprint": "9ae4a5de4cc3d86fdfbdf235c93bdbfc3a375862892b6e62a4e6bbcd1ced1685",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "81057959": {
    "fingerprint": "25a981114f391b3793ad828a56b2787501c9473da14f6ff5cfe990c2dc836162",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "81179446": {
    "fingerprint": "07a3f72f468114e1ea5055a5838b0510e4dd7a6e36c8e525e84c1d8bdafd16d8",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "81386177": {
    "fingerprint": "ad474e1c5979d14dbb65e5c8b49ab4ded1bcb688d4e85173dd793e137ec6fc04",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "81492226": {
    "fingerprint": "09e4dd8ef67f5ef8630900791165dd5431a535789605d29bfb379a175c0c91dc",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "81563416": {
    "fingerprint": "3cca7ab2ab44f988317c46cc5c49e6e4ba449a54db0af1574d9aeca461da18c7",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "81618817": {
    "fingerprint": "df092309ddbfb405d7fcad9fe0184cddfe2d1dd314652aecb28c915cd5cf7301",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "81686058": {
    "fingerprint": "b98af33149c03e4b6cfcda2efa58cb2996f0e48d9ef0ed83a02002a3bff8a2c9",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "81777047": {
    "fingerprint": "097d704cace55364cd8824187a4159cf4b48390cabe71ad200343057d0ea7826",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "82065276": {
    "fingerprint": "4dc300a8f6f71353d3e8dd65f724396b4f53d5bf7269b7408c1e8d2d6b9f7204",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "82085619": {
    "fingerprint": "7aed780bfcc6134e0935526fc30796d4aa2977971cf3b0edcf7f81a4fe5baf45",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "82732705": {
    "fingerprint": "736d62c31bc10fc520573ab11d6ba26717b21e4c6b1c5b92ae941de725ab89d4",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "82742611": {
    "fingerprint": "c00bfbe02cb85fd67b72bb1826972ac12c7a48bfef0e2d251fd37f907951beab",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "82818645": {
    "fingerprint": "95dbda369179040eabc62e328e94c95ea9f57a86c30fa992c0b1250b21375972",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "82878489": {
    "fingerprint": "053b925afc69b1b5015e577c3434e8f12bd206048b515db1da0e3abdf787aa15",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "82999629": {
    "fingerprint": "8c22edb79b83b4c6ce9041efab7d29da2c604e2c2eecc64609f28272491ac007",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "83011277": {
    "fingerprint": "f8b998d23994e7c1017cfa68b728e2b4f15a8ea279234729682f6408cc47d88b",
    "suites": [
      "tests/classicBattleRecruiters.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "83464209": {
    "fingerprint": "bb2419d33c7149294e28b60d5fbe773ce47effa3b5edd7f819aa944c51aebf7b",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "83678433": {
    "fingerprint": "dd75abee783e4a139ec10660bf1e141f2adff6a19b9cf2453f2067f08b99050d",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "83746708": {
    "fingerprint": "73ffd8d20f18bec1990cc71250809a53dff1a7337c92757b241973e8bf32514d",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "83764718": {
    "fingerprint": "c2e38ab4134ee2434e1da2a755c60e69710cb5ab5d46f4ceeb0d56b6875db0a0",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "83764996": {
    "fingerprint": "f251474bbf52c5fa0f78f77b4db7c4d7398bf695991aa626143b17c19b1ad352",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "83968380": {
    "fingerprint": "50cf27da92c0898c476f630ae027013b6b0fbe07f316f745e5856642fdc1be05",
    "suites": [
      "tests/classicExpansionFamilies.test.cjs"
    ]
  },
  "83994646": {
    "fingerprint": "1a08f1bee854092d0abccfbdbdfdfe376e4558baff5572324102100c78f14888",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "84103702": {
    "fingerprint": "944a6d928ba7b68122fe4fdee0a85aa1d593102c643ff5dd7e467d3bec57d7a7",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "84257639": {
    "fingerprint": "64ef363bf8100b70b55115aadd69dc9be474e47962ed84e0a2a00c5bbdf0f939",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "84285623": {
    "fingerprint": "e5af2b718ca1b3488cf9bf313edb745e6c5294b31b7f5c92454b4c29e7833376",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "84620194": {
    "fingerprint": "dbe558303c5740e2fa599fb1b42109141846f67821675d0ffac5a93224976fc5",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "84686841": {
    "fingerprint": "39b7595bc116ec3185e9720500964d410bd57d01300b0ee65f9926d743fc19c0",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "84696266": {
    "fingerprint": "653e8a1ab82082653a784320458f71ca65b7a5bbff64f74c893456a4b8489e4e",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "84794011": {
    "fingerprint": "f65c33732a058df7afc1b517761a62aab9eabd345836b2594d242fb08bfaceb0",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "84834865": {
    "fingerprint": "7ea81906abee8111a13e8d9a51d42e521f7db546ef51fe061b4f7f9762332b95",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "84916669": {
    "fingerprint": "866eadb74e0638663493bd20091ef3ba50f125df13be09f6e678016c5a86653c",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "84990171": {
    "fingerprint": "fc6c74800341f13400f56d22a132e28432d264eae34db87c69fdcfab453a154e",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "85309439": {
    "fingerprint": "975a62e89de2b272b2a10a1605e6b6164d876d501f441ffc6cdb8975d6990f35",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "85326399": {
    "fingerprint": "5aa20038030829ee1b4c7f05076579891019eeb043286c119e0cc9793132f099",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "85448931": {
    "fingerprint": "7bfde9fbb1af99d39f22bd6feddaee125c78641ca0b5dbf6f910b75ae5555b29",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "85639257": {
    "fingerprint": "7ac8962842a6e950614913c94efa17fb28825d11a2846f1554c7203651ac7228",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "85705804": {
    "fingerprint": "12af9903982ed165a49ab4e7d2f7122d1724a438b5bad63a0eccf783455cbc7f",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "85936485": {
    "fingerprint": "b678cbdb96124f702c2c2fb617ce51910b65ac92030a79021a5aff136ea2c18e",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "86088138": {
    "fingerprint": "bef3b765aa43cafc9323ce5c9c2e471eebd0b850372a8e19c9485acbaf4b1d0c",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "86281779": {
    "fingerprint": "652deb8c20c73b6d899b7a17cf988fd65d4d932dea9b21c6ef322b0169458485",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "86318356": {
    "fingerprint": "d8bc328ac0c0b62a69b62cefa16067df5a20d17a8f7ee5f8919dc92567937c39",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "86325596": {
    "fingerprint": "668c54444b86af1a32d19ec636ece100b7ab944c2ca824351e5840ee0d49efe1",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "86421986": {
    "fingerprint": "c85c227f0e2b22115604831d6b70f86fbc56e6386f5cf321d9dba09a328e503f",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "86498013": {
    "fingerprint": "5fe75c7119438e499e10d7989c575f6ea3d1eae29919e47b4dc8cfc2e5329315",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "86569121": {
    "fingerprint": "61c1f1d452cf2bf92c9b959826a1f08163310f910ed5bb2f0f3e9eb3bb7fe26f",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "86652646": {
    "fingerprint": "98923ad2c0171684dec4a3923e6bdb003e53d356e5b21ee4bf73994aeb367c8a",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "87303357": {
    "fingerprint": "7cc62613dda8f387c4ada612ac03250b9c3978f3860b3b76f904f2915295b2a9",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "87322377": {
    "fingerprint": "eeff56ab8eaa0ca0b9a153ad88fcc1f7167bb7913be2d738945d6f7821895ea4",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "87430998": {
    "fingerprint": "5b7b623889999855f8f4c3fdde925110ba36ff56efce764da4a3d9891e742eec",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "87511987": {
    "fingerprint": "dc6b154f8994b50f0fb9568e3f625693777b84443e551b947f0f99b425004ae4",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "87564352": {
    "fingerprint": "da2045711508a52dfaf67bed99438af2e32edaaf084391283c694b9d620f5028",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "87796900": {
    "fingerprint": "b0a0c8c1d7dbaef43d9a168dd40bf9817cee5e4cf4228267d1f79073c9d7ec11",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "88435542": {
    "fingerprint": "6286709ffe9927c7ab75875b63c0d20df4af7b069e608ae944041c1576083d4c",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "88643173": {
    "fingerprint": "b3ae114bce4e6bc0cc75c5f1b5559b0f1356fccc730eb5563566fe9f98b2bf25",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "88819587": {
    "fingerprint": "13417f59dd8e0b0c609aeda7a206d2b4e1baeb128b3dbd7433f9cd7b6b1b1bd3",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "88979991": {
    "fingerprint": "506d497bdb7b64e0b943568c549efbf758581ecb8cf2dec345afa08fdecb6f72",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "89091579": {
    "fingerprint": "e72d19e14afdd19658fc194141395e81567b40a7fde00720da5f159e866acc20",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "89272878": {
    "fingerprint": "938d72647f89156b418ce0aea58544f22d2cc87ee896dc848b68aa2f2fef9062",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "89494469": {
    "fingerprint": "cf1ca553c1319dbd3b13d9eefd6a0cb2e434e4083958c3f5e7cb6ddd715fdd25",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "89558090": {
    "fingerprint": "197c8da4f2929194a712a140989101bb5a81397235470d59c0861b90eeb54a50",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "89631139": {
    "fingerprint": "424f74a723418cfbfb0439940fdf76921e1d712b2d3a7866f5c64e699b2b397b",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "89832901": {
    "fingerprint": "1dfb7660b3cc741d57e91134106fe159f37b186d27eddebe6987d556d5bb4b73",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "89904598": {
    "fingerprint": "b8dd8ce49d6217e8faac62387ed973cd45d611a4a3b009a0f684bf644d522487",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "89959682": {
    "fingerprint": "22691d34bbf80891002881a9cf092c4d9297bbd1deb09f04ab70a063b8c6f8ba",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "89987208": {
    "fingerprint": "6bed8f3228e5f90e15e3ddf7524d5a43d364d54df90c35e09938b8a605562a02",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "90357090": {
    "fingerprint": "0325634d894f4eb4fc875c568d6fbaa3581e121c01142d27c36c2b4c016382bc",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "90660762": {
    "fingerprint": "f3d138373e082a7874550505d36b1e2b0a1fcb3640ce303efb523134ba3f32e0",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "90876561": {
    "fingerprint": "3cdc892af0f1e1c2a0c3a7f8a44159e3dba0a3cf1a54d5c51683438e9f39ccef",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "90908427": {
    "fingerprint": "bff9cce40816ce1a2d4b24cb9fa6c1faf5edf1edab6fc068dc8cbab145a4b531",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "90963488": {
    "fingerprint": "8bd561dfdc25f9b12f1b4f590867462023f104e0c839a175d0dc647ed70c0f48",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "91152256": {
    "fingerprint": "d7ac6e71e2c64b5bb2ca7485872bc9c95acf18cf707edbcdc7d741718b8c3ec8",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "91595718": {
    "fingerprint": "b601e84d2f22953d16573b1d3c7cec64d49accb295b6adfa6aefbfe38800bebb",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "91862578": {
    "fingerprint": "c0a541b6480de3208c7c11ef854e8237781c1b4603de85a6dc7f7d53aecfa32f",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "91869203": {
    "fingerprint": "c755d733ae29ea519bd519ba0f54ebba92146f159bd1315885f703f34d55869e",
    "suites": [
      "tests/mechanicalBatch7.test.cjs"
    ]
  },
  "91939608": {
    "fingerprint": "74ddbcb41acaa861a9fc4e0db892921a71ed59296d45ac8aed8a8064a8f42635",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "91996584": {
    "fingerprint": "1a75f8687f3e65ba886d1a6f18b27555a93c9c844b62ab935cfe1078afd05501",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "92391084": {
    "fingerprint": "9acc86d7f77535a26ada11763ea3f0319f353bd249e53b211a9957b9b420aa10",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "92409659": {
    "fingerprint": "078d1d695aafcfc52fbc09d592a76fa2c2382edcc1d42bc29d8e3d6e9a9a1ffa",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "92421852": {
    "fingerprint": "f83b37fd895f8073c300529180dabe3ecf9d2060c9de45ea61619a27ff20384e",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "92667214": {
    "fingerprint": "625d890e074898d513a3d78c81c05df722d7ce82f12e6f2cb8043a4aaaa25abb",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "92731455": {
    "fingerprint": "1566652c78dd7d039a81da65902ee2bae456abdd7ef25e0d01e3a13220a7efd9",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "92944626": {
    "fingerprint": "ba8acaaf62ec7673920ebd5b8e63bceda6796dcb278a0e85a78617f8bf50925a",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "93108297": {
    "fingerprint": "94b267de9587f1d8c9ced35df8f37140d9a67fa66e8ccdb2887a87735ea3e355",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "93221206": {
    "fingerprint": "ecfd0b88d66457c7e027a9e8ee79b8042f9d0972a8b5df57075176d1869b6203",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "93343894": {
    "fingerprint": "ef0b94d0eb12e39591baee92900cb774732ba182bababe4fb328a38eff632f17",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "93346024": {
    "fingerprint": "aba6457c700d45895afbab55b23fd220d256900a99cbfb01557d2dfee51a1fc5",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "93553943": {
    "fingerprint": "9b623e4cd3a67900756d7f33a49205843b5401f4f3468e5b9793f46aaa6e88ed",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "93788854": {
    "fingerprint": "25f1ee03e32845df28ecfcf678e3eac099349c888f2d67a811bcb9c269e8fc9c",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "94022093": {
    "fingerprint": "270c66ae59ef38d734e38b99f53a3242f7d0addc72fa10bb4c19b215e2279933",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "94042337": {
    "fingerprint": "80ea4368d0651c46764a3ea936beca114a28ee835b266d7a611de382b61b9497",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "94119974": {
    "fingerprint": "ebe31f2d9557504ec17d00e2261f19864963343ec4fbbb67e582d38c3390226d",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "94412545": {
    "fingerprint": "afba732b9f3c9990a5956654ac0d6999c16566e2caa67f5e77e7ab5c8c356013",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "94566432": {
    "fingerprint": "a92099eb5ce4e6a6c76b3e6eb212a66c2bfaa9b99e9b006c4c4633d5b00f8d01",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "94675535": {
    "fingerprint": "6f56fa70b05cceed36e7662160f20c698ff09630edbdf8c264355d43b07ed0bb",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "94905343": {
    "fingerprint": "58aa1fda5470eefc1d8eb68fb5f99da006a0586982f8c96bfb02a5bc3ce5e23c",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "95144193": {
    "fingerprint": "1035bd50347616961b391028fb12a7c5b5ba41c0ce0835e2569738afc79ea347",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "95265975": {
    "fingerprint": "d2311431cd5502d0eb0975e13e5897872c8f15fbeef44fca6db523f4af68e268",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "95288024": {
    "fingerprint": "35f0165d106a99a9a93a8f9350b6b7400be5acb96cffe8c202fcf5d6d0b33d20",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "95952802": {
    "fingerprint": "d48d71920b20445471e84049be45e09c3d9076bb46e225425c81919d03c65b84",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "95956346": {
    "fingerprint": "16703b4a3261548d7d5a23efb0979938d796d3056a255563e0810f96bb854055",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "96643568": {
    "fingerprint": "d2126b804d948584fc53b19daa2073997a063071f0b240126cb7f9a6c516b105",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "96851799": {
    "fingerprint": "61eb30cfc8fce28858cbabafe09d5204a941e7409500017d6b93ec0e2f41efe5",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "96981563": {
    "fingerprint": "56dafff9e7f89276fd681ef192e01ab45a66139eb9bf611eb8ac813865adf145",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "97017120": {
    "fingerprint": "40b674a6174e3dc3f5c028d6bf1d3914d7d73fdaaa07079c0c8c5131a6f1fc2f",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "97360116": {
    "fingerprint": "970ca209d4157be42affac7a428f0ae28f919d4d18656ac641ddf60dd5d71c29",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "97590747": {
    "fingerprint": "31c78584759c4650a04d7c33a8e9d820d48777cbd7664f11ee388c67eee429db",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "97612389": {
    "fingerprint": "795577f89930b9872d48e94ba5f0a4974364d05bc17d1670bf66b171ca7f5484",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "97843505": {
    "fingerprint": "c5e48640c4cdc1b8b4f0fc8e978bb944b240e204d79ed5db31cd60df04de5346",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "97923414": {
    "fingerprint": "f0c9891f8e01f062b122e86a0a9c2c9466c0ce51bdd66b3e507ef283996039e1",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "97973387": {
    "fingerprint": "713b2472268bfb63c51a394fd642ad23f65c92eb07a5b7b1bdb2648117a13149",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "98049915": {
    "fingerprint": "cadf7249880046f6ba1558936fdc940326f3159fcd899610fb339e1719a293a4",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "98075147": {
    "fingerprint": "bc3c93218025d71f6b014ebbeef01c1c053f664c56743590ba7b3029e4fa303d",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "98252586": {
    "fingerprint": "b67ac192c403e4284dc4236664e7f4c0f267499eb20d556daf1d56be2ee449c8",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "98374133": {
    "fingerprint": "3d5a00d47c53c42380a7541649c12daaf65975b189ea76b282ed4152defca251",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "98456117": {
    "fingerprint": "5f45442c7c1aaac7cb03535a811161d51f76a6a3021a3c74fdb0bc887ffce414",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "98582704": {
    "fingerprint": "5428c504a97d35ef53ace66f253aacb23d0e730bfb418c0522f22d598abd9ba0",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "98795934": {
    "fingerprint": "b2222b1642f14c0e006d169e8a32d025f6342b81b09f54e1a2e60c5a3b2267a0",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "98818516": {
    "fingerprint": "0e5c22a9a4871dc053ae29c6afb7767e4232fbadb108ea3cf4669b0e63890fac",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "98898173": {
    "fingerprint": "db34d978f3a1b9581e68cfed0baea74216b324217068de08d5dfb54edece802c",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "99030164": {
    "fingerprint": "0e11f20cd2a336635b66b98b733e6449975412ee44a47ba938bcfb3c9bb85c0c",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "99171160": {
    "fingerprint": "a51c9fb8d4a4c83ab0ed7cedf2481869018bdadaf490c5ec6c17b0826750b17f",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "99261403": {
    "fingerprint": "0b6ca5ff0686165b48242f8e3040b23847923c9f7f4bd7d6958ec4412fa8f9cf",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "99510761": {
    "fingerprint": "a421660b7c5b6bf17400072231d538ef45665de737882eaffd8a2fbc2c1fe488",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "99551425": {
    "fingerprint": "c6fbc14e17a7f791da488832ceb6bf4ccf3649df932088c6f9797360ab868cf2",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "99785935": {
    "fingerprint": "02013a27df08b522a4e0a75d897eecdb56ee2a2ccbedbaf91b5552568f787db1",
    "suites": [
      "tests/historicalNormalExpansion9d.test.cjs"
    ]
  },
  "05600127": {
    "fingerprint": "ae0ac28dc540d41e11630e9b9e8ad61da819de2b8e9fb4eaa709c7d433d3d5f3",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "06840573": {
    "fingerprint": "6ca14a6bee76732a82d71e2e9d580ca2f718a43513aea0ab876671fb4dc5356e",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "08327462": {
    "fingerprint": "07ef2e790e20021bfcb8b14ce99cac3c2cbcdf05ed7d469685de608277717a84",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "09293977": {
    "fingerprint": "7403938c84d42adb87725aa2dda1e60adc64f70209a60c21c4019d6401c0ff55",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "09653271": {
    "fingerprint": "9e88c3430811aa841368e3120d1c40d9d970cc75bb870374263ae9e3fa7805df",
    "suites": [
      "tests/historicalFusionExpansion10.test.cjs"
    ]
  },
  "00032864": {
    "fingerprint": "e440f8cc3ff9b32fa3b0b7659ca7865a7805a1f0645c03f6956599fbaa252569",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "00549481": {
    "fingerprint": "da9737f7fc9902540cc77ea6783d3c1dff167c3665396f9622cfa3cedbca95b7",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "00732302": {
    "fingerprint": "95d00cdcce9c4835b120859b8a9d80d8943b8b4d165f06eec6aeabe4b63bef2d",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "01761063": {
    "fingerprint": "6b637ff5cf0c3ed8552542cfdebebdf14908e66b545c9bc3ce8ecfb5498a3a84",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "01929294": {
    "fingerprint": "1c9ced74d1eff5707349c3f23863f73dbf468cf26f69e2a45059f8ebd3c5c2eb",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02118022": {
    "fingerprint": "2fd6c1bf9123746a0f9c3eb46049df1412e0bb6c3046bca709d3d208674dde15",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02311603": {
    "fingerprint": "cd71b28b2f17e7687949f9632adeeb7edc6839a5a896381b8f802498469de064",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02483611": {
    "fingerprint": "9af144aed4585859a62251431c988730b03145b0a9bbe31edf9d95d7becf0fee",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02863439": {
    "fingerprint": "cf78b3963a89c610b6d08175913a235220fa18bfb4b4eb36c70cfc3a0df1467c",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02906250": {
    "fingerprint": "9c69ddaeca6e6f3214bbdfa88268774d6b3aa9355d741ad19456dcc4ad2b5f1f",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02957055": {
    "fingerprint": "0e3cd007675e9dc8a3eedac2461d3834c7e3933c13023086cddd97a10fbc121b",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02964201": {
    "fingerprint": "03042e634f0c0d9082ee3ebc122e02e9fe26b953e326f681b53c905f36e37c6b",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "02971090": {
    "fingerprint": "91ebdc76daba99637150236b30751e6a6171dbc61e4bff6156f433eafbaa05cb",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "03134241": {
    "fingerprint": "f2f90d80e47c7eb95d42c59e55dd66d1fb310e5f368bcc4b88888d118d26ed49",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "03170832": {
    "fingerprint": "19d54a576b0d499eeb165780f3de07a3717e9f7f471d1b05de57946b197ec322",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "03606209": {
    "fingerprint": "ec2ddd55320ecbd4904a36eccafdbbb9b20ac84590559e50edcf51fbab9ec04c",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "03797883": {
    "fingerprint": "49c5c1b5303ea9636da8d6e235787be67de96b12e71ebadb1d97b58a43808480",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "04035199": {
    "fingerprint": "55e9448f7c36fad4183320c453bcd16ee63d5fffed013d9c4ed8294ddd2a48dd",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "04179849": {
    "fingerprint": "5a30705575c557e100b2b56f5717f6ad529de6b3744ac87b323e2119e18fa044",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "04392470": {
    "fingerprint": "6509c0ea522c88763a9cb32b7f8ab81672ade37ff35c81688c7419320a14e044",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "04920010": {
    "fingerprint": "6e757281740d332e5d26d0d6d64f17534f71dac66cf9556e2fe64fe7cd98f47e",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "04931562": {
    "fingerprint": "ed571561f9529b78d6997c3949338c95cb5328b865cd828d69efd69913d09782",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "05265750": {
    "fingerprint": "02a16dd176221729e7bc2f05c454ca0e8c429e9e3d8515d29a5afc83e1909d77",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "05434080": {
    "fingerprint": "5c3d89317cc8992de31764d3bb24ae5089198dd9978a6e111a60149ee538ce6f",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "05464695": {
    "fingerprint": "a8b6fa8402ede29ef97eb45e3cc316e2d8147ee52e627d41d9f7adf64a3b632b",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "05628232": {
    "fingerprint": "8958a60ae944dc6eda28a074190a550d44f09b4f5dfdda167d8116086d05be86",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "05818798": {
    "fingerprint": "426e6b001778ab9f0aca74ab5771034dd1e62df11727ba7056b235eee8e0ff3d",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "06103114": {
    "fingerprint": "db91cc876739dd87895f7a6f723dce69cc9fd3bf7d864dfd71a29410ddf65922",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "06297941": {
    "fingerprint": "9b369dee7bc3371b84ae2a0c3a47ad5232ed2f507963dffdf6bdcee7db378e07",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "06367785": {
    "fingerprint": "2126cf9f0ce76547727a2baa7ec07754f833144a7e98f872112ba00b88ed8d24",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "06400512": {
    "fingerprint": "bdba85ba69837bc680c8ee19889e73bec94eda686cad992bdcd45b4cfa0e3053",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "06740720": {
    "fingerprint": "da683dbe93d06449496fd358e900600f0c89788639428924b05467b212279248",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07225792": {
    "fingerprint": "b9c133cd4191ac9e9c81d34965d591256acb717a2bbabfe045f25a91320b76ba",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07359741": {
    "fingerprint": "99936c9f1d966ae9363829907f331ab1adb4a84aa85c47144217f6a3d069941d",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07526150": {
    "fingerprint": "782bbd160fae361dc2c49f162f9c19ae318167a2b58a431426c3b2e71de65765",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07562372": {
    "fingerprint": "226ce9954f231e6d6e0e4d4fb52235660205e3cbc269a1efad78f7a7da78bf6e",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07670542": {
    "fingerprint": "6ea5960ee10528164f0f6f980d5960c8cdaadc5904e7400e44f113e9a6f830c8",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07805359": {
    "fingerprint": "f2bf826c25c347ded517724efec83d7966e7b7f36d74edadc6c1088c72ee277e",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07892180": {
    "fingerprint": "4cb4f921aed37a7350d74b7cfc149a385693bca57e4887e370008aca2df76759",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07902349": {
    "fingerprint": "cb03a1532cfe6fcbe3ca52b71d689ce3ce9d2bf672bbf6e89c8af64177614f89",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "08058240": {
    "fingerprint": "88e78dba4dfdfdc0d58bebc16c7c76e37deaf244b3611920ec95921b7910d395",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "08124921": {
    "fingerprint": "08e36f6dbe6dc5754c1c2212753ac367479b5fcbffd060853891bba717509139",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "08353769": {
    "fingerprint": "1869eec7c5be3232ae68f1c2c425c11c3d5abe370401ec854c3fc8e7234e2d18",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "08471389": {
    "fingerprint": "b2aa530310031cf93e869188a4c700937b42cb2c4a492ab4916411df5951fe13",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "08715625": {
    "fingerprint": "2de7d9f40db9eee84da88cbc5b4fed10abe2e16b660b25e3e65eb69460653f18",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "09197735": {
    "fingerprint": "a0ba9fc276943ae33d5daa72f422e3f86ce97241db6c632efc9f388014182aa0",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "09540040": {
    "fingerprint": "75ebb8bf2cd70db7fa5aef7f319e612c182e4a7eef949bd47455d457d8ed9959",
    "suites": [
      "tests/historicalNormalExpansion9a.test.cjs"
    ]
  },
  "07089711": {
    "fingerprint": "d6d05f8b69c83200362ce785134e4533f28f93b0f7578be9fa1d48712f1646d2",
    "suites": [
      "tests/classicFlipEffects.test.cjs",
      "tests/engineRefactor.test.cjs"
    ]
  },
  "03819470": {
    "fingerprint": "7f46aa36ec0cc795d3b9a77b48ab57d2c5982afb1ef2fd3677d247f48adc20b4",
    "suites": [
      "tests/classicCounterTraps.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "05318639": {
    "fingerprint": "269697e799f0d073ae6181fe460c12f25dfcd797b48adca707f7ce26ac22dce8",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicCardReview.test.cjs",
      "tests/classicTargetReview.test.cjs"
    ]
  },
  "04031928": {
    "fingerprint": "1563fb8a12859b06130ef04d5adee049e20dcc429ad9b9c036b27ead7ab4dce2",
    "suites": [
      "tests/classicEngine.test.cjs"
    ]
  },
  "04206964": {
    "fingerprint": "514a0ed16d1564dade7b75a288f58773f3ec1f4e28576610f336c777def8d6b9",
    "suites": [
      "tests/classicSummonResponses.test.cjs"
    ]
  },
  "04614116": {
    "fingerprint": "0a5b822e1461ff59445c6b8a62c8dcb86e288ac9df3a2ce5f0c0665009096753",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "01435851": {
    "fingerprint": "2a37131e50b1ba4af8510b3ed231553f36d94d0a46f05fd5ec8ff77357c0693d",
    "suites": [
      "tests/classicEngine.test.cjs",
      "tests/classicPersistentReview.test.cjs"
    ]
  },
  "00756652": {
    "fingerprint": "f58f73f4522d57ce1441a27fa6f2e522bb1d8582bc10224a00fba3bc0a0b5e5f",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "03573512": {
    "fingerprint": "16bd9acc342f9452f9880b416f1f6381464d24ca0b1844bf60c45493c96060f7",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "05053103": {
    "fingerprint": "9f32af48041e3f395cd9b920e64fabda4cfaa86964476268ff1a0d8fc8ec794c",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "06368038": {
    "fingerprint": "985b6bc6010a3faee75c1a2c0bc55d26776cf2c93315d851aef85cd4e85293cd",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "01184620": {
    "fingerprint": "975287043a5be6c07cce6d178366c865c8699861a76131fe0b0f50cb42c3b924",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "01784619": {
    "fingerprint": "a892593886ceb3171e11fb92d9c7bd0d135fe7608533b152b4327400ead3f6bc",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "04042268": {
    "fingerprint": "97a51c05cbeaea6db6f129611dfbba717a7e241598f8b4d6851dc06f03b6d911",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "05388481": {
    "fingerprint": "55a156b0fbae57d09e7849b831b255cf52e37c886ee64721ab5137984e0cfe98",
    "suites": [
      "tests/duelEngine.test.cjs"
    ]
  },
  "08783685": {
    "fingerprint": "34e1428d68b519a31ad75dcf3490fead71b0cc71b90a289532a9d984dcf455ec",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "09159938": {
    "fingerprint": "91704d9a44a98e38f663c1fffe284bc7a406161d2b9ffef2de044dbfcba00c9d",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "09430387": {
    "fingerprint": "d825ae061c8f0c9ddcf133558e31c1a3c2eb6c1f9bbef8498242c61d6a81e7b1",
    "suites": [
      "tests/historicalNormalCertification.test.cjs"
    ]
  },
  "08944575": {
    "fingerprint": "303254399d542d5d0f1b1bd28ff869a585ef582f46dde10a471ca260e504f0c8",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "03985011": {
    "fingerprint": "977a334b0a843ce96e8777e6c92428cc9e175c63e0d9ad0f5c0827ffb1643c39",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "03732747": {
    "fingerprint": "49b2f511db4d9f0632daa78311f2556df72cf45a950ae06135a8d988398136b9",
    "suites": [
      "tests/historicalNormalBatch4.test.cjs"
    ]
  },
  "05901497": {
    "fingerprint": "02fa064f8b6d0d948dec8beede32c6ea798eae4cb378d44525e557e236ec62d0",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "02370081": {
    "fingerprint": "dfeb22b82a650da91f0423f66331afcc32b4b6978c5c9bca88dd755e3462ed28",
    "suites": [
      "tests/mechanicalBatch5.test.cjs"
    ]
  },
  "07489323": {
    "fingerprint": "a54842a3a0e3d5f082fb4b6870201ceb7da0893211e71bb3bb02ed950459530f",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "08201910": {
    "fingerprint": "11ff92a95964e5ddc19995f823f5a2d8766132ee4fe7803fd3e9a8c4f7738b06",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "00403847": {
    "fingerprint": "883e15673cfcd19b4ce670f439b47879625fa6e95e288e1be29ba44a5d540dd1",
    "suites": [
      "tests/mechanicalBatch8.test.cjs"
    ]
  },
  "02830619": {
    "fingerprint": "1613a0678f91a50b6405453c018103046003325746509bfd7c07efd4a2202786",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "01641882": {
    "fingerprint": "36c66b304a76d14c8067364f9b96000135a76d611c0142bd97f0dba788fc9e46",
    "suites": [
      "tests/fusionBatch8.test.cjs"
    ]
  },
  "01557499": {
    "fingerprint": "736be19fb6b73de12194329f5059197abb8f6c7efac2e8ee3ee495b4270178c1",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "02792265": {
    "fingerprint": "c9010b19951f5e47b79fd633a85b7207828b4104dbce65a465c7fe750fb7d513",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "03492538": {
    "fingerprint": "fd7856a0059dff4b5bed154b2dfd7bfc9c053c2e5ca6e57a12b6b9b2cf0a82f5",
    "suites": [
      "tests/mechanicalBatch11.test.cjs"
    ]
  },
  "96890582": {
    "fingerprint": "9b9232cd1383d481d6eca6e50a386612b8ed0abca65f621c72488b98565c333e",
    "suites": [
      "tests/mechanicalBatch14.test.cjs"
    ]
  }
,
  "20101223": {
    "fingerprint": "8bfa1b6dfa26ab7c76fb756998f63a514103a3eafd92bcae9bc43cb3bcce87ea",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  },
  "21323861": {
    "fingerprint": "d5b15fe36788289d462dd5fb4cf75730890f374edefc13e7fb59574670aab062",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  },
  "26725158": {
    "fingerprint": "ffaf47c9ce40851792a13eab04344bdf3d32012b57f3e54a23cca46670ec1237",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  },
  "56606928": {
    "fingerprint": "31da04e27dc6095c5a777c6ae1f8d2674c1b4706a8ca3ba506cc9ef9a808abb9",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  },
  "90330453": {
    "fingerprint": "c73c8f4a441e085075f886d39e9b421f183d7e979056ea00d50bb0347fdf807c",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  },
  "90873992": {
    "fingerprint": "8c5d1ad1c8c027a073ae613be82fceb3c72a035d882e1c3978398b7ed6285dd8",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  },
  "94716515": {
    "fingerprint": "0d84fb0581b4fe51f991d43fc0a7f32e63508466384c9656e6becf44ecb572c4",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  },
  "95051344": {
    "fingerprint": "92bc4dd72a4664dc14fd00655025d3f0fffde0c865d2ae048fdbc55f28a1e5b0",
    "suites": [
      "tests/filteredDestruction15.test.cjs",
      "tests/mechanicalBatch15.test.cjs"
    ]
  }

,
  "78193831": {
    "fingerprint": "740e347dd42620f30250214dfa3048c1abdd26dfc2bb35a631c696cb8269f0d9",
    "suites": [
      "tests/mechanicalBatch16.test.cjs"
    ]
  },
  "01434352": {
    "fingerprint": "4663c10121ddcd36bf95ef4f90671ba192094f846cd2ea599a3a8b0e9f6bccda",
    "suites": [
      "tests/mechanicalBatch16.test.cjs"
    ]
  },
  "04542651": {
    "fingerprint": "b9d34ab83a76b18217b41c4e7f8a968678280d915f7b258917d8aa5537761ead",
    "suites": [
      "tests/mechanicalBatch16.test.cjs"
    ]
  }

,
  "38277918": {
    "fingerprint": "72931ee16b6d5e6bee99839536a21c07b2981727e4638d4de51fe4e9e45eabda",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "38999506": {
    "fingerprint": "1379e4ed67c6f60cdd7839ac2ac94fe3af76f57accd44869ae36b4cfd53fec5e",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "39552864": {
    "fingerprint": "8a0fe3c6cb7a7da207b30d695ac15e71f0316e8925a0e73a30f069c40daf37c5",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "39674352": {
    "fingerprint": "73aac5b10319934dff04eb86e67ce5bf623ed76a299239a01f982def7856a34b",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "59053232": {
    "fingerprint": "e700a9d56be2771f7b3039c03ba42e825348a2d3f0d6ff8878ca7c55f7db41b6",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "59983499": {
    "fingerprint": "621b075faa991aa9e7d670bcb0147efb7e6a8712c80eb4f94895b96cb3e6b994",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "65957473": {
    "fingerprint": "277b24cb6522fdbc1b6831e2426205748899eb3feffb817a1d2e2314568ab7cd",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "66073051": {
    "fingerprint": "8690b0a2839e0a453cc2353fc864470c78dc8e308fd0b1c6c3da65d662116c5c",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "96967123": {
    "fingerprint": "c544216c8dee60298ff1fba0fe7a00ec9629e59bfab67bf5248ac3ce82af2524",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },
  "02468169": {
    "fingerprint": "99c9937f286459222d7fa3f694d8e6a24420a9971e5445d8445faa0187372618",
    "suites": [
      "tests/worldNormalBatch16.test.cjs"
    ]
  },

  "45311864": {
    "fingerprint": "95cb4868a02f890c43823e307825a6f60a56ada730271de153f957055545253f",
    "suites": ["tests/mechanicalBatch17.test.cjs"]
  },
  "46700124": {
    "fingerprint": "d37d6753f327e2a3ca25621ab4ca0588e018e6f74540e99b98be467121727667",
    "suites": ["tests/mechanicalBatch17.test.cjs"]
  },
  "82108372": {
    "fingerprint": "edc6469c31e0184ad550f388706654c2adafa8aaa482c947e2222b1be5fb4d12",
    "suites": ["tests/mechanicalBatch17.test.cjs"]
  },
  "18891691": {
    "fingerprint": "972503e1ea9748f10bb72bd77e6fa44eb633a24037ad8e65a059e282659d3e54",
    "suites": ["tests/mechanicalBatch17.test.cjs"]
  },
  "42883273": {
    "fingerprint": "c6de597ed7f3df48ead6f64e6d00a9db6344a16df4f897bd8d3ac63092e32f51",
    "suites": ["tests/mechanicalBatch17.test.cjs"]
  },
  "23995348": {
    "fingerprint": "03df62496e0d354f62747db103612c898ef5a3a55b7f3948f90e2fc928d7985a",
    "suites": ["tests/mechanicalBatch18.test.cjs"]
  },
  "37101832": {
    "fingerprint": "259a21fa0d36b212e816ddc95f0755eb7c4729ee5f7d0597be703a8e375e52d1",
    "suites": ["tests/mechanicalBatch18.test.cjs"]
  },
  "68638985": {
    "fingerprint": "61f1b3251f284e61ff22dff8390d847465a6b23962504586645e16a06f9195f3",
    "suites": ["tests/historicalNormalBatch19.test.cjs"]
  },
  "14898066": {
    "fingerprint": "5a842a2e1f403df8948e385d1b74771a3ce9e77b7df19b1bde05e076acaa12c8",
    "suites": ["tests/historicalNormalBatch19.test.cjs"]
  }
,
  "10012614": {
    "fingerprint": "728af32ae1bdb657493a86cfe5329913d27d2117aaed9f79c0ef8c1486d9db59",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "11901678": {
    "fingerprint": "483c342c4ddd05ac398338c1e3ce3c047e681909fbad77c6751bc1eeba30cbc7",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "20394040": {
    "fingerprint": "c0e91c4b26b3e60cfe132b90cd822fd9ce1eab4bf6bb8c6f53cf3c4b112f84dd",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "27967615": {
    "fingerprint": "2dfcfb17f98be85177241ad4f8af7de3e5a459fd4e1006781d8d447cd2b79717",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "38033121": {
    "fingerprint": "551fe6dd3487924eac186227546e8760ce0ba8a156e141406cf8e5bfd4221434",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "40453765": {
    "fingerprint": "0255c69e9edb61196ba80a8e5ccad13e03404fdfd8e69481cb1697df4bfd5662",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "47480070": {
    "fingerprint": "391ddcb07fe88a11a322aa568c228715b8550b9da8963925141498fed2f33c28",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "52040216": {
    "fingerprint": "8e825db4ac5fc8df7aa59ff0b396b489e009cbc6f02e341d31b0c16b1e8af257",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "63224564": {
    "fingerprint": "c1472e8788e91ae6b6b3dad33f915332ac40466953a6e2394a24e050f40bee8f",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "81380218": {
    "fingerprint": "4d7585f91cde747c579ff851915a0959d8b8a9598a87679a249d8e7c8b478558",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  },
  "91932350": {
    "fingerprint": "468bf338442cf39be17379484aa766e1a8d62cccfe41a062ddca077ae1ad0376",
    "suites": [
      "tests/mission21ActiveBatch.test.cjs"
    ]
  }

,
  "26932788": {
    "fingerprint": "850111c0128c36a40037276324a983095727cfb2ec37fbc9d50a9e66e9219d74",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "30208479": {
    "fingerprint": "4aa3edcff620dbc77e926df0f033f0cca96d71e1d43d75de81a647accdbb784e",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "30243636": {
    "fingerprint": "4d889f28db89756caece707dfc6d19ea2d6a0ade97195946b280a2b83ed20a09",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "31066283": {
    "fingerprint": "cdbab65062e40f0c71750f348fc4efe220a620590fde0b394c32605caec4404d",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "31890399": {
    "fingerprint": "ae296bb6ad1cdbfe237b90dc8875c8810e4c16cba03cdd4e124a24504895a3e9",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "33951077": {
    "fingerprint": "368dbdcdd1c51e328a9cfdc6e71bd8cc9c5bd89421bb1d1d801487f6e83a22ec",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "39399168": {
    "fingerprint": "bded7ec889a01a1b47fc6294fc35f2fbe117a2ac4c5a73f797d3167fb3eada01",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "41182875": {
    "fingerprint": "9c68b248c5b9f206bf895d7580b298681186a477ce12a3a7fdb7c10d6c9b16f0",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "43417563": {
    "fingerprint": "11bb3bc5cece44dd8491b7cc563b2bd53beadcc4090618e9100efecb3e0d3577",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "43694075": {
    "fingerprint": "21ea9ca377a87ac7edb97b59a694271acc3d6d29608435b7862c86b9f99bf3fa",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "49064413": {
    "fingerprint": "9b0a7383cc8a7b9fa7bd73be5701c960ea32156d2a0fda1ae93c3f60bfb1c8c8",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "54539105": {
    "fingerprint": "93cb07926ce7f40cecc49197e79f372c2aa7b4aaa475d7b3733ac3b87748e285",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "55761792": {
    "fingerprint": "5f39cdba31cd9639556aa6229cc1712d9e871fa87cb3ee23914aee25e57701f5",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "62337487": {
    "fingerprint": "20effe17e329efac4fdaa32e0785ee403207cb80b8a034db6ee2fd9e85e5ca41",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "65393205": {
    "fingerprint": "61cc9213670ec1290be02b96af4a0ac7f5c8684c56610be6aad908d92eecdeb4",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "69123138": {
    "fingerprint": "39d7fcc04c87de8befc95f9158c81fcecb74f57d4c614c2c8f3b3cff2a80ea19",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "76792184": {
    "fingerprint": "32a50191d1821e5dcee8900ccbf26227aacb5ef8406ee3a51b8cc8bdcea270bc",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "76806714": {
    "fingerprint": "de070eb199b753fc252b82a6b8d2e7b93f511159dd186c96ce5ccbb7bd5fd572",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "77454922": {
    "fingerprint": "e8a553d7838f397737180764dcef5eba544551cb02f2b539cb87e2d3a99d409d",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "78577570": {
    "fingerprint": "f5756ce941c35189f53581267f1928b7510a08770ab76bbb8d84fca848bc2ac8",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "80811661": {
    "fingerprint": "5955e2a4860322e7ea1ac6192fe86743866387c3be55b542efdf1379542b4db1",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "81756897": {
    "fingerprint": "4d5aa6f23c2388d491c283a7915d0ca194eb01764177f1c31ff4526aa92704d0",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "81933259": {
    "fingerprint": "30d12efda853af92379603c54431b4ec1b8e2cd512d1744830d090bf680842d5",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "90844184": {
    "fingerprint": "b99aaddef8fc412400a02fe495abe90733227c23969b0365d68a5f9ec1309e4f",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "91782219": {
    "fingerprint": "8c49df035c9ac33cedcfc3a92453afce5852df813be224750760c5eede0de7eb",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "94377247": {
    "fingerprint": "5a28b2a01004405a42bc4448ebac426009e174706b69ab7bc076db3f2121458e",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "99721536": {
    "fingerprint": "135d6da8c7de2a5b64212e13218a715c980c6a324b2024a715b80a051d772bfc",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "05405694": {
    "fingerprint": "8bec3946eec3e3fd158bcf7a3ff36cdd48427b43bb71f2b2fbc0e3e6e21e191e",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "04849037": {
    "fingerprint": "e2a621a96a05b6f94f2e5288d252b89fcc46eeb519f6e628d5f0f2a4b907e802",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  },
  "03627449": {
    "fingerprint": "b42819713a9e93e0de078e01bd34583303c9f348a2d54440604c1e9194b5580e",
    "suites": [
      "tests/ritualBatch22.test.cjs"
    ]
  }

,
  "54351224": {
    "fingerprint": "f35648b3f7b1b0db971a1e12860aafab2c41bc76056618cd47a50506a8a0cb4a",
    "suites": [
      "tests/ritualExtensions22.test.cjs"
    ]
  },
  "59820352": {
    "fingerprint": "7f8816d43cab1b3fcece6d293cee72c10b80641749610dc57fe598b1ad151cf7",
    "suites": [
      "tests/ritualExtensions22.test.cjs"
    ]
  },
  "69035382": {
    "fingerprint": "0bf90c0a1296964faff6dee03bc96ca4bef0e7f00d62ff31e88c304bb6064baf",
    "suites": [
      "tests/ritualExtensions22.test.cjs"
    ]
  },

  "38699854":{"fingerprint":"8495bd6e655a7a842da721db2a4caf7f488d3cf906d28ed6daaa60aa6f11deaa","suites":["tests/mechanicalBatch28.test.cjs"]},
  "63102017":{"fingerprint":"26fc43396ac74f0f6692cd59cbd24c757517ef0c89630e2e09d5aabe3ce84468","suites":["tests/mechanicalBatch28.test.cjs"]},
  "93747864":{"fingerprint":"bdd313088a0f3ddfcba87770bdf8595c3481bbd3b5cc8c7b8da95ea9db9325aa","suites":["tests/mechanicalBatch28.test.cjs"]},
  "45895206":{"fingerprint":"a95cd75eea615f2d3668d844a04db8c8fb160d78c25eee910f5e4cc4ef3c38ef","suites":["tests/mechanicalBatch28.test.cjs"]},
  "96947648":{"fingerprint":"3576b4f88d74afc380b37e0590202ff4924d8c55c152c205f242ee76c761fe7b","suites":["tests/mechanicalBatch28.test.cjs"]},
  "90928333":{"fingerprint":"d6231659d7d9372011d8395a558ba09a85b216788ec0981a57d382a57e2ea0fd","suites":["tests/mechanicalBatch28.test.cjs"]},
  "24623598":{"fingerprint":"7702ea9d26f968294553b35675ee9207686dc42eff6a3b05c27521cd50136202","suites":["tests/movementBatch28.test.cjs"]},
  "82542267":{"fingerprint":"e3f4a28f281218c3ed682628adb98bcab333e9cd7a9bd14a6e05ff0b71168e33","suites":["tests/movementBatch28.test.cjs"]},
  "05758500":{"fingerprint":"e617e5f72621fa2186ca072befb372b052d52c633d31e3c105c91faaf7e709e6","suites":["tests/movementBatch28.test.cjs"]},
  "06343408":{"fingerprint":"107b648a2ac6f2bf071449afa750bccea1e5346b417a638a35d875cd2ede064d","suites":["tests/movementBatch28.test.cjs"]},
  "78864369":{"fingerprint":"7dcf89cd21a28e0de90980f53634528f2188d9b01d371105aec4951bc3fe20cd","suites":["tests/movementBatch28.test.cjs"]},
  "36280194":{"fingerprint":"c7e45957ab4a1ed30780db406af7cee314c103124851a8424ec6950d0db0e2ba","suites":["tests/movementBatch28.test.cjs"]},
  "85742772":{"fingerprint":"163f60e07a09980ed7bd82a34b6a07d15104793868349922ffa869f1c6633b8d","suites":["tests/attackBatch28.test.cjs"]},
  "23615409":{"fingerprint":"1270d0d3ab8e4456bc25380a12c5aa15b6e841b72c63147750a888c3562f8b7d","suites":["tests/attackBatch28.test.cjs"]},
  "95220856":{"fingerprint":"5e6544122374f6ba94d96e07b66026f6e710fe0dfd13a55b56ef6b3295b15f5d","suites":["tests/attackBatch28.test.cjs"]},
  "55013285":{"fingerprint":"f5f34b30103e335af762ae5b9706164efb7febb249a9e62fe6cae70121fe63cf","suites":["tests/recruitBatch28.test.cjs"]},
  "93107608":{"fingerprint":"cfbf4d23b5f397d34b1c6cf6729af3f37ef158dcc42a5518d3ec8c496ebf6c61","suites":["tests/recruitBatch28.test.cjs"]},
  "77044671":{"fingerprint":"80a597df711ad7ee3fd598d04ca985548aa5893514b13a57148d40c0e0e5ae14","suites":["tests/recruitBatch28.test.cjs"]},
  "39191307":{"fingerprint":"e67247ea2fa9769f8ca26c4c395b301d57c0813b2807162861a53456f4d283f0","suites":["tests/recruitBatch28.test.cjs"]},
  "24317029":{"fingerprint":"6cfdcb2fdbe404f7f29b94841b25aec40ef158687ba5ebd9f1dcdf42ed408309","suites":["tests/recruitBatch28.test.cjs"]}
,
  "21015833": {
    "fingerprint": "b3e5813c6b39327cb93bfb151580a16f78134db5fbd71aeedba772fc30ed367f",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "21417692": {
    "fingerprint": "682aeea995586526578d41e21e86f21cbdac77a890aafb82b4ea42515d638691",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "31812496": {
    "fingerprint": "2210e1f5c863717d0f1ac3afd17c841684d6ee829ae1ad77e6ea9d22f90d9943",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "44762290": {
    "fingerprint": "ce3ce0126b281f1d2b2bd54c8fb2ab2d828b6ca0a41eb19639003d4e7fabb3b1",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "45425051": {
    "fingerprint": "22159ebebd3ef539a5c78a504bcb3c43366b53eb49e8d72cc79fd79a35b55fc4",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "50823978": {
    "fingerprint": "721e405e86683592f76493a17c6cb2fd5de9113834bf286ff91dc2300b222f95",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "51838385": {
    "fingerprint": "907aca58eea75322947d24eaa0270e08ff707e4cc602afa65bb76e91b794eed3",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "52077741": {
    "fingerprint": "8ce6c96733bf879dc39c9beba009204234a59cdc61e7cc581c9b6e517ad24e6a",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "54178050": {
    "fingerprint": "ca6b5533962567ce471ecad03fb565cb16f74de6169962e323290183803aaa7e",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "55821894": {
    "fingerprint": "eca59771865d78b1a9a86815166c0314f84ec1ae41705525bbcee69826ae8918",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "56433456": {
    "fingerprint": "667bf21923f9d978b510c97bdb3dcce620565b5386206ddc788638b34626c423",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "57482479": {
    "fingerprint": "ab26193bfa6ff0ccf8fa467572cdb0c0422dfe61ad5b32d04661d20c160b1a54",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "60519422": {
    "fingerprint": "8615d1fe82bca5f4a1bae21f47c5140ec5317792093e0db2ede4a4e831d416e2",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "63695531": {
    "fingerprint": "a9454039735cf752405b214e46695486556d2cb64d62f62a184602a5772ea94a",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "64751286": {
    "fingerprint": "30cb382558067f02c429c3153b3dceaa709dac162a51a600568ba09c87e09605",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "65287621": {
    "fingerprint": "56047301b693118e35bb6f2bc544225655cbb54f67c067fb3a5074289ba2bcfa",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "72520073": {
    "fingerprint": "deaabc5502773b2ca85b13c5996f666b960235a7f0bc430f54a882160c765b14",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "76909279": {
    "fingerprint": "74f90dd8109796d3e7ce3f22b1ec6b3dce2abc38ba5ccad275c803c7483b2d94",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "79870141": {
    "fingerprint": "d8fd44d3e6188172dc1cc1c0a9714cf045a1571ecdeb345d3183ef4092551ca8",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "82003859": {
    "fingerprint": "1416bb7e60b4182946e0c2844aec23413044b71e5e6537a11da8017f112da50b",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "82035781": {
    "fingerprint": "3ed802b8274e226cbb38270121e7e2a4685c7677447ebd81fb1bc4fc8fb6dc5d",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "93013676": {
    "fingerprint": "a03de9b888d35084e7aca3cb6ab07cca59dfd24d27280bd80f8374f97749ea00",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "95638658": {
    "fingerprint": "a1cb0a53dafc8d87e05714350a74b6c6413ac307202826608541f71031b93434",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "07019529": {
    "fingerprint": "7bbbc5302304637871ec9d3caa977ac8c85cd83eb21b88ccb67bb2a75ed7fb95",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "09817927": {
    "fingerprint": "f88320378100ec23cb53f71957f438a5ec38b016a3dab3771745ad8e67ddf974",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  },
  "05494820": {
    "fingerprint": "e4192101b23007595cb25a882e934432c451c6f5e9634ff59f2f18a02c9c62c3",
    "suites": [
      "tests/combatBatch29.test.cjs"
    ]
  }

};
