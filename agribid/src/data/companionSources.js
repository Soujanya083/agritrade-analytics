// companionSources.js - every reference the Companion Planting feature cites.
//
// Rule: an entry exists here ONLY if the page was retrieved while this feature was validated.
// `type` says how much weight a source deserves:
//   'peer-reviewed' journal article / meta-analysis   'institute' research-institute publication
//   'extension'     university extension / NCAT       'review'    literature review
//   'secondary'     summary or aggregator page (weakest; never the only support for a claim)
// Run `node scripts/checkSourceLinks.mjs` to confirm every link still opens (add --write to stamp `verifiedOn`
// on the links that opened). `verifiedOn` is OPTIONAL: no date means the link has not been re-checked yet.

export const SOURCES = {
  // ---- how strong is companion-planting evidence in general?
  extWsu: { title: 'Gardening with Companion Plants (Home Garden Series), Washington State University Extension', url: 'https://pubs.extension.wsu.edu/product/gardening-with-companion-plants-home-garden-series/', type: 'extension' },
  extUmn: { title: 'Companion planting in home gardens, University of Minnesota Extension', url: 'https://extension.umn.edu/planting-and-growing-guides/companion-planting-home-gardens', type: 'extension' },
  extAttra: { title: 'Companion Planting, ATTRA Sustainable Agriculture (NCAT)', url: 'https://attradev.ncat.org/wp-content/uploads/2022/06/companion-planting.pdf', type: 'extension' },
  // ---- wheat, mustard, chickpea (India)
  wheatMustardIjas: { title: 'Yield advantage and reciprocity functions of wheat + Indian mustard intercropping under varying row ratio, variety and fertility level (Indian J. Agric. Sci.)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/view/3212', type: 'peer-reviewed' },
  wheatMustardFym: { title: 'Productivity, compatibility and economics of wheat and Indian mustard intercropping under irrigated conditions (Indian J. Agric. Sci.)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/view/79098', type: 'peer-reviewed' },
  wheatChickpeaBangladesh: { title: 'Intercropping or mixed cropping of wheat with lentil, chickpea or mustard (Whaley & Islam, Bangladesh Agricultural Research Institute, 1981; AGRIS record)', url: 'https://agris.fao.org/search/en/records/64774ca9a3fd11e43038569f', type: 'institute', verifiedOn: '2026-10-24' },
  wheatChickpeaGrdc: { title: 'Intercropping and companion cropping of high value cash crops: wheat and chickpeas in central NSW, how did they perform? (GRDC Update Paper, 2023)', url: 'https://grdc.com.au/resources-and-publications/grdc-update-papers/tab-content/grdc-update-papers/2023/02/intercropping-and-companion-cropping-of-high-value-cash-crops-wheat-and-chickpeas-in-central-nsw-how-did-they-perform', type: 'institute', verifiedOn: '2026-10-24' },
  wheatChickpeaAlgeria: { title: 'Species interactions improve above-ground biomass and land use efficiency in intercropped wheat and chickpea under low soil inputs (Latati et al.; DOAJ record)', url: 'https://doaj.org/article/a4128f8d06714df795049fab110800a2', type: 'peer-reviewed', verifiedOn: '2026-10-24' },
  wheatLentilHawalbagh: { title: 'Performance of lentil and toria intercropping with wheat under rainfed conditions of north-west Himalaya (Indian Journal of Agricultural Sciences)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/view/24163', type: 'peer-reviewed', verifiedOn: '2026-10-24' },
  wheatLentilIndore: { title: 'Inter/mixed cropping of lentil in late-sown wheat for higher productivity and profitability of wheat in Vertisols of central India (Indore, 2012-14)', url: 'https://i-scholar.in/index.php/Ijas/article/view/169049', type: 'peer-reviewed' },
  lentilMustardBihar: { title: 'Plant density and row arrangement of lentil and mustard intercropping for higher productivity under Bihar plateau (Indian Journal of Agronomy)', url: 'https://pub.isa-india.in/index.php/ija/article/view/3380', type: 'peer-reviewed' },
  mustardLentilGramMandal: { title: 'Comparative suitability of Indian mustard in intercropping with lentil and gram under rainfed condition (Mandal et al., Indian Journal of Agricultural Sciences)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/view/29853', type: 'peer-reviewed' },
  mustardLentilDelhi: { title: 'Mustard and lentil intercropping system as influenced by moisture conservation (Agronomy Research Institute, New Delhi; Indian Journal of Agricultural Sciences; title abbreviated)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/download/41486/18495/96609', type: 'peer-reviewed' },
  sugarcaneGarlicPusa: { title: 'Fertilizer and irrigation requirement in sugarcane and garlic intercropping system (Pusa, Bihar, 2010-13; Indian Journal of Agronomy)', url: 'https://pub.isa-india.in/index.php/ija/article/view/4389', type: 'peer-reviewed' },
  sugarcaneOnionTnau: { title: 'Production potential of wide row sugarcane intercropped with aggregatum onion under different row ratios, fertilizer levels and population densities (TNAU Coimbatore; Indian Journal of Agronomy)', url: 'https://pub.isa-india.in/index.php/ija/article/view/3173', type: 'peer-reviewed' },
  sugarcaneAutumnIcar: { title: 'Autumn sugarcane-based intercropping (Indian Farming, ICAR)', url: 'https://epubs.icar.org.in/index.php/IndFarm/article/download/117687/45520/307690', type: 'extension' },
  sugarcaneLegumesKarnal: { title: 'Mechanized intercropping of legumes in spring planted sugarcane (CCS Haryana Agricultural University, Karnal, and ICAR-IIWBR; Vegetos)', url: 'https://www.vegetosindia.org/article/mechanized-intercropping-of-legumes-in-spring-planted-sugarcane', type: 'peer-reviewed' },
  ragiPigeonpeaKrishikosh: { title: 'Studies on productivity of finger millet based intercropping system (finger millet with pigeonpea in several row ratios; Krishikosh record)', url: 'https://krishikosh.egranth.ac.in/items/7cb3d7ed-f4a9-4e16-8afd-f7c02ade9900', type: 'institute' },
  ragiLegumesMaitra: { title: 'Productivity, competition and economics of intercropping legumes in finger millet at different fertility levels (Maitra et al., West Bengal; Indian Journal of Agricultural Sciences)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/view/28741', type: 'peer-reviewed' },
  ragiKarnataka1980: { title: 'Intercropping with ragi in Karnataka (1980 proceedings note, Indian Society of Genetics and Plant Breeding)', url: 'https://worldveg.tind.io/record/8082', type: 'review' },
  maizePotatoKanpur: { title: 'Production potential and monetary advantage of winter maize-based intercropping systems under irrigated conditions in central Uttar Pradesh (Kanpur; Indian Journal of Agricultural Sciences)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/download/2847/944/5831', type: 'peer-reviewed' },
  maizePotatoBhu: { title: 'Cropping geometry and nutrient management study on winter maize + potato intercropping (Banaras Hindu University; Indian Journal of Agricultural Sciences)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/view/115112', type: 'peer-reviewed' },
  maizePotatoShimla: { title: 'Nitrogen requirement of component crops in potato + maize intercropping in north-western hills of India (Central Potato Research Station, Shimla; Potato Journal)', url: 'https://epubs.icar.org.in/index.php/PotatoJ/article/view/40306', type: 'peer-reviewed' },
  wheatIntercropReview: { title: 'Wheat-based intercropping: a review', url: 'https://www.researchgate.net/publication/283026382_Wheat-based_intercropping_A_review', type: 'review' },
  mustardWheatLentil: { title: 'Production potential and competitive indices of Indian mustard based intercropping with wheat and lentil under different row ratios, eastern Uttar Pradesh (Arch. Agron. Soil Sci.)', url: 'https://www.tandfonline.com/doi/abs/10.1080/03650340.2013.777432', type: 'peer-reviewed' },
  wheatChickpeaIjra: { title: 'Int. J. Research in Agronomy 2024; 7(11): 430-436 (wheat-based intercropping incl. wheat + chickpea 2:2 and wheat + mustard)', url: 'https://www.agronomyjournals.com/archives/2024/vol7issue11/PartF/7-11-32-815.pdf', type: 'peer-reviewed' },
  wheatMustardFrontiers: { title: 'Frontiers in Sustainable Food Systems (2026): wheat-mustard intercropping row-ratio study', url: 'https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2026.1761977/xml', type: 'peer-reviewed' },
  chickpeaMustardIjas: { title: 'Effect of row ratios and organic nutrient management on Indian mustard + chickpea intercropping (Indian J. Agric. Sci.)', url: 'https://epubs.icar.org.in/index.php/IJAgS/article/view/140083', type: 'peer-reviewed' },
  mustardBundelkhand: { title: 'Effect of mustard-based intercropping systems on yield and profitability under organic management in Bundelkhand region', url: 'https://www.researchgate.net/publication/371566854_Effect_of_Mustard_Based_Intercropping_Systems_on_Yield_and_Profitability_under_Organic_Management_in_Bundelkhand_Region', type: 'peer-reviewed' },
  // ---- pigeonpea intercropping
  sorghumPigeonpeaIimr: { title: 'Sorghum inter-cropping with pigeonpea, ICAR-Indian Institute of Millets Research', url: 'https://www.millets.res.in/sorg_technologies.php', type: 'institute' },
  pigeonpeaBreedingPmc: { title: 'Breeding pigeonpea cultivars for intercropping: synthesis and strategies (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5982186/', type: 'review' },
  pigeonpeaCompetition: { title: 'Competition indices of different pigeonpea based intercropping systems', url: 'https://www.researchgate.net/publication/354006419_Competition_indices_of_different_pigeonpea_based_intercropping_systems', type: 'peer-reviewed' },
  pigeonpeaEquivalent: { title: 'Effect of intercropping on pigeon pea equivalent yield under different land configuration', url: 'https://www.researchgate.net/publication/329116852_Effect_of_intercropping_on_pigeon_pea_equivalent_yield_under_different_land_configuration', type: 'peer-reviewed' },
  pigeonpeaLegumeRes: { title: 'Pigeonpea equivalent yield and intercropping indices of organically cultivated pigeonpea based intercropping (Legume Research)', url: 'https://arccjournals.com/journal/legume-research-an-international-journal/LR-5543', type: 'peer-reviewed' },
  pigeonpeaSorghumExpAgric: { title: 'Preliminary studies of intercropping combinations based on pigeonpea or sorghum (Experimental Agriculture)', url: 'https://www.cambridge.org/core/journals/experimental-agriculture/article/abs/preliminary-studies-of-intercropping-combinations-based-on-pigeonpea-or-sorghum/6D47DCCF8C25F2B46F0BA05E31A288FD', type: 'peer-reviewed' },
  // ---- maize with legumes
  maizeSoybeanMeta: { title: 'Intercropping maize and soybean increases efficiency of land and fertilizer nitrogen use: a meta-analysis (Field Crops Research)', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0378429019305945', type: 'peer-reviewed' },
  maizeSoybeanRowRatio: { title: 'Row ratios of intercropping maize and soybean can affect agronomic efficiency of the system and subsequent wheat (PLOS ONE)', url: 'https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0129245', type: 'peer-reviewed' },
  maizeSoybeanRelayPmc: { title: 'Effects of reduced nitrogen inputs in a long-term maize-soybean relay strip intercropping system (PMC)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5598979/', type: 'peer-reviewed' },
  maizeBeanFrontiers: { title: 'Maize-common bean intercropping study (Frontiers in Sustainable Food Systems, 2023)', url: 'https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2023.1052392/full', type: 'peer-reviewed' },
  maizeBeanLegumeSci: { title: 'The efficiency of maize and common bean intercropping using economic, competitive and biological indices (Legume Science)', url: 'https://onlinelibrary.wiley.com/doi/full/10.1002/leg3.70072', type: 'peer-reviewed' },
  maizeBeanEthiopia: { title: 'Economic evaluation and intercropping indices of maize-common bean system under variable fertilization in Southwestern Ethiopia (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13328660/', type: 'peer-reviewed' },
  maizeWhiteBean: { title: 'A two-year study on yield and yield components of maize-white bean intercropping systems under different sowing techniques (Agronomy)', url: 'https://doi.org/10.3390/agronomy12020240', type: 'peer-reviewed' },
  // ---- push-pull (maize, East Africa)
  pushPullIcipe: { title: "On-farm evaluation of the 'push-pull' technology for the control of stemborers and striga weed on maize in western Kenya (icipe)", url: 'https://thehive.icipe.org/all-prp/2642/', type: 'institute' },
  pushPullEconomics: { title: "Economic performance of the 'push-pull' technology for stemborer and Striga control in smallholder farming systems in western Kenya (Crop Protection)", url: 'https://www.sciencedirect.com/science/article/abs/pii/S0261219408000069', type: 'peer-reviewed' },
  pushPullEthiopia: { title: 'Evaluation of push-pull technology for pest and soil fertility management on maize in north western Ethiopia', url: 'https://www.sciencedirect.com/science/article/pii/S1125471824000124', type: 'peer-reviewed' },
  // ---- rice systems
  azollaOverviewPmc: { title: 'An overview of underutilized benefits derived from Azolla as a promising biofertilizer in lowland rice production (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9880398/', type: 'review' },
  azollaDoubleRice: { title: 'Azolla planting reduces methane emission and nitrogen fertilizer application in double rice cropping system in southern China (Agron. Sustain. Dev.)', url: 'https://link.springer.com/article/10.1007/s13593-017-0440-z', type: 'peer-reviewed' },
  azollaAssessment: { title: 'Assessment of Azolla for carbon capture, biofertilizer application and rice productivity enhancement in sustainable lowland farming systems', url: 'https://link.springer.com/article/10.1007/s43621-025-02210-9', type: 'review' },
  riceDuckWeeds: { title: 'Integrated rice-duck farming decreases soil seed bank and weed density in a paddy field (Agronomy)', url: 'https://www.mdpi.com/2073-4395/9/5/259', type: 'peer-reviewed' },
  riceDuckSoil: { title: 'Ecological effects of rice-duck integrated farming on soil fertility and weed and pest control (J. Soils Sediments)', url: 'https://link.springer.com/article/10.1007/s11368-016-1455-9', type: 'peer-reviewed' },
  riceDuckBiocontrol: { title: 'Effects of integrated rice-duck farming on weed pressure, herbivore-predator interactions and economic benefits (Biocontrol Sci. Technol., 2022)', url: 'https://www.tandfonline.com/doi/full/10.1080/09583157.2022.2044016', type: 'peer-reviewed' },
  riceDucklings: { title: 'Use of local ducklings to control insect pests and weeds in the growing rice field (Livestock Research for Rural Development)', url: 'https://www.lrrd.cipav.org.co/lrrd11/2/men112.htm', type: 'peer-reviewed' },
  riceFishIndia: { title: 'Sustainable food production through integrated rice-fish farming in India: a brief review (Renewable Agriculture and Food Systems)', url: 'https://www.cambridge.org/core/journals/renewable-agriculture-and-food-systems/article/sustainable-food-production-through-integrated-ricefish-farming-in-india-a-brief-review/279050FC710C522C20CD60C13CE001B2', type: 'review' },
  // ---- marigold and nematodes
  marigoldPlantDisease: { title: 'Effects of selected marigold varieties on root-knot nematodes and tomato and melon yields (Plant Disease, 2002)', url: 'https://apsjournals.apsnet.org/doi/pdf/10.1094/PDIS.2002.86.5.505', type: 'peer-reviewed' },
  marigoldReview: { title: 'A review: using marigolds (Tagetes spp.) as an alternative to chemical nematicides for nematode management', url: 'https://www.researchgate.net/publication/336277476_A_Review_Using_Marigolds_Tagetes_spp_as_an_Alternative_to_Chemical_Nematicides_for_Nematode_Management', type: 'review' },
  marigoldAngelica: { title: 'Crop rotation and intercropping with marigold are effective for root-knot nematode control in angelica (Can. J. Plant Sci.)', url: 'https://cdnsciencepub.com/doi/10.1139/cjps-2016-0071', type: 'peer-reviewed' },
  // ---- shared pests and diseases
  blightNdsu: { title: 'Late blight in potato, NDSU Extension', url: 'https://www.ndsu.edu/agriculture/extension/publications/late-blight-potato', type: 'extension' },
  blightUmass: { title: 'Solanaceous crops: late blight, UMass Amherst Center for Agriculture, Food and the Environment', url: 'https://www.umass.edu/agriculture-food-environment/vegetable/fact-sheets/solanaceous-late-blight', type: 'extension' },
  blightExtension: { title: 'Organic management of late blight of potato and tomato (Phytophthora infestans), eXtension', url: 'https://articles.extension.org/pages/18361/organic-management-of-late-blight-of-potato-and-tomato-phytophthora-infestans', type: 'extension' },
  blightUw: { title: 'Potato late blight, University of Wisconsin Vegetable Pathology', url: 'https://vegpath.plantpath.wisc.edu/diseases/potato-late-blight/', type: 'extension' },
  earwormUsu: { title: 'Corn earworm / tomato fruitworm, Utah State University Extension', url: 'https://extension.usu.edu/planthealth/ipm/notes_ag/veg-tomato-fruitworm-corn-earworm.php', type: 'extension' },
  earwormIllinois: { title: 'Corn earworm (Helicoverpa zea) insect fact sheet, University of Illinois IPM', url: 'https://ipm.illinois.edu/fieldcrops/insects/corn_earworm.pdf', type: 'extension' },
  earwormMissouri: { title: 'Corn earworm / tomato fruitworm guide G7110, University of Missouri Extension', url: 'https://extension.missouri.edu/media/wysiwyg/Extensiondata/Pub/pdf/agguides/pests/g07110.pdf', type: 'extension' },
  // ---- general rotation principle (secondary sources only)
  rotationSalisbury: { title: 'Crop rotation is the key to breaking disease cycles (Salisbury Greenhouse)', url: 'https://salisburygreenhouse.com/crop-rotation-is-the-key-to-breaking-disease-cycles/', type: 'secondary' },
};

export const SOURCE_TYPE_LABEL = {
  'peer-reviewed': 'Peer-reviewed study',
  institute: 'Research institute',
  extension: 'University extension',
  review: 'Literature review',
  secondary: 'Secondary source (weaker)',
};

export const sourceList = (ids) => ids.map((id) => ({ id, ...SOURCES[id] })).filter((s) => s.url);
